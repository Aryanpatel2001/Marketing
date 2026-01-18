import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  CreateTopUpSessionDto,
  TransactionListResponseDto,
  TransactionQueryDto,
  TransactionResponseDto,
  UpdateWalletSettingsDto,
  WalletResponseDto,
} from '../dto/wallet.dto';
import {
  TransactionChannel,
  TransactionReferenceType,
  TransactionStatus,
  TransactionType,
  WalletTransaction,
} from '../entities/wallet-transaction.entity';
import { Wallet, WalletCurrency } from '../entities/wallet.entity';
import { StripeService } from './stripe.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {}

  // ==================== WALLET MANAGEMENT ====================

  async getWallet(tenantId: string): Promise<WalletResponseDto> {
    const wallet = await this.findOrCreateWallet(tenantId);
    return this.mapWalletToResponse(wallet);
  }

  async findOrCreateWallet(tenantId: string): Promise<Wallet> {
    let wallet = await this.walletRepository.findOne({ where: { tenantId } });

    if (!wallet) {
      wallet = this.walletRepository.create({
        tenantId,
        balance: 0,
        reservedBalance: 0,
        currency: WalletCurrency.USD,
      });
      await this.walletRepository.save(wallet);
      this.logger.log(`Created wallet for tenant ${tenantId}`);
    }

    return wallet;
  }

  async updateWalletSettings(
    tenantId: string,
    dto: UpdateWalletSettingsDto
  ): Promise<WalletResponseDto> {
    const wallet = await this.findOrCreateWallet(tenantId);

    if (dto.lowBalanceThreshold !== undefined) {
      wallet.lowBalanceThreshold = dto.lowBalanceThreshold;
      wallet.lowBalanceAlertSent = false;
    }

    if (dto.autoRechargeEnabled !== undefined) {
      wallet.autoRechargeEnabled = dto.autoRechargeEnabled;
    }

    if (dto.autoRechargeAmount !== undefined) {
      wallet.autoRechargeAmount = dto.autoRechargeAmount;
    }

    if (dto.autoRechargeThreshold !== undefined) {
      wallet.autoRechargeThreshold = dto.autoRechargeThreshold;
    }

    await this.walletRepository.save(wallet);
    return this.mapWalletToResponse(wallet);
  }

  // ==================== TOP-UP ====================

  async createTopUpSession(
    tenantId: string,
    stripeCustomerId: string,
    dto: CreateTopUpSessionDto
  ): Promise<{ url: string; sessionId: string }> {
    const wallet = await this.findOrCreateWallet(tenantId);
    const frontendUrl = this.configService.get<string>('frontendUrl');

    const successUrl = dto.successUrl || `${frontendUrl}/settings/billing?topup=success`;
    const cancelUrl = dto.cancelUrl || `${frontendUrl}/settings/billing?topup=cancelled`;

    const session = await this.stripeService.createTopUpCheckoutSession({
      customerId: stripeCustomerId,
      amount: dto.amount,
      currency: wallet.currency,
      successUrl,
      cancelUrl,
      metadata: {
        tenantId,
        walletId: wallet.id,
      },
    });

    if (!session.url) {
      throw new BadRequestException('Failed to create top-up session');
    }

    return { url: session.url, sessionId: session.id };
  }

  async processTopUp(
    tenantId: string,
    amount: number,
    stripePaymentIntentId?: string,
    stripeChargeId?: string,
    metadata?: Record<string, unknown>
  ): Promise<WalletTransaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      wallet.balance = balanceAfter;
      wallet.totalCredited = Number(wallet.totalCredited) + amount;
      wallet.lastToppedUpAt = new Date();
      wallet.lowBalanceAlertSent = false;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepository.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.CREDIT_PURCHASE,
        status: TransactionStatus.COMPLETED,
        amount,
        balanceBefore,
        balanceAfter,
        description: `Wallet top-up: $${amount.toFixed(2)}`,
        referenceType: TransactionReferenceType.TOP_UP,
        stripePaymentIntentId,
        stripeChargeId,
        metadata: metadata || {},
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      this.logger.log(`Wallet topped up for tenant ${tenantId}: +$${amount.toFixed(2)}`);
      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== DEBIT OPERATIONS ====================

  async debit(params: {
    tenantId: string;
    amount: number;
    channel: TransactionChannel;
    description: string;
    referenceType: TransactionReferenceType;
    referenceId?: string;
    messageCount?: number;
    unitPrice?: number;
    metadata?: Record<string, unknown>;
  }): Promise<WalletTransaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { tenantId: params.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const availableBalance = Number(wallet.balance) - Number(wallet.reservedBalance);
      if (availableBalance < params.amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore - params.amount;

      wallet.balance = balanceAfter;
      wallet.totalDebited = Number(wallet.totalDebited) + params.amount;
      wallet.lastDebitedAt = new Date();

      await queryRunner.manager.save(wallet);

      // Determine transaction type based on channel
      const debitType =
        params.channel === TransactionChannel.SMS
          ? TransactionType.SMS_DEDUCTION
          : params.channel === TransactionChannel.EMAIL
            ? TransactionType.EMAIL_DEDUCTION
            : TransactionType.SMS_DEDUCTION;

      const transaction = this.transactionRepository.create({
        tenantId: params.tenantId,
        walletId: wallet.id,
        type: debitType,
        status: TransactionStatus.COMPLETED,
        amount: params.amount,
        balanceBefore,
        balanceAfter,
        description: params.description,
        channel: params.channel,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        messageCount: params.messageCount,
        unitPrice: params.unitPrice,
        metadata: params.metadata || {},
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      // Check for low balance alert
      await this.checkLowBalance(params.tenantId, wallet);

      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== RESERVE/RELEASE ====================

  async reserveFunds(
    tenantId: string,
    amount: number,
    referenceId: string,
    description: string
  ): Promise<WalletTransaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const availableBalance = Number(wallet.balance) - Number(wallet.reservedBalance);
      if (availableBalance < amount) {
        throw new BadRequestException('Insufficient funds to reserve');
      }

      wallet.reservedBalance = Number(wallet.reservedBalance) + amount;
      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepository.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.RESERVED,
        status: TransactionStatus.PENDING,
        amount,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance),
        description,
        referenceType: TransactionReferenceType.CAMPAIGN,
        referenceId,
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      this.logger.log(`Reserved $${amount.toFixed(2)} for tenant ${tenantId}`);
      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async releaseFunds(
    tenantId: string,
    reserveTransactionId: string,
    actualAmount: number
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reserveTransaction = await queryRunner.manager.findOne(WalletTransaction, {
        where: { id: reserveTransactionId, tenantId, type: TransactionType.RESERVED },
      });

      if (!reserveTransaction) {
        throw new NotFoundException('Reserve transaction not found');
      }

      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const reservedAmount = Number(reserveTransaction.amount);
      const unusedAmount = reservedAmount - actualAmount;

      // Release the reserved amount
      wallet.reservedBalance = Math.max(0, Number(wallet.reservedBalance) - reservedAmount);

      // Deduct actual amount
      if (actualAmount > 0) {
        wallet.balance = Number(wallet.balance) - actualAmount;
        wallet.totalDebited = Number(wallet.totalDebited) + actualAmount;
        wallet.lastDebitedAt = new Date();
      }

      await queryRunner.manager.save(wallet);

      // Update reserve transaction
      reserveTransaction.status = TransactionStatus.COMPLETED;
      await queryRunner.manager.save(reserveTransaction);

      // Create release transaction
      const releaseTransaction = this.transactionRepository.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.RELEASED,
        status: TransactionStatus.COMPLETED,
        amount: reservedAmount,
        balanceBefore: Number(wallet.balance) + actualAmount,
        balanceAfter: Number(wallet.balance),
        description: `Released reserved funds. Used: $${actualAmount.toFixed(2)}, Returned: $${unusedAmount.toFixed(2)}`,
        referenceType: reserveTransaction.referenceType,
        referenceId: reserveTransaction.referenceId,
        metadata: {
          reserveTransactionId,
          actualAmount,
          unusedAmount,
        },
      });

      await queryRunner.manager.save(releaseTransaction);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Released funds for tenant ${tenantId}: reserved=$${reservedAmount.toFixed(2)}, used=$${actualAmount.toFixed(2)}`
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== REFUND ====================

  async refund(params: {
    tenantId: string;
    amount: number;
    description: string;
    referenceType: TransactionReferenceType;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletTransaction> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { tenantId: params.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + params.amount;

      wallet.balance = balanceAfter;
      wallet.totalCredited = Number(wallet.totalCredited) + params.amount;

      await queryRunner.manager.save(wallet);

      const transaction = this.transactionRepository.create({
        tenantId: params.tenantId,
        walletId: wallet.id,
        type: TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        amount: params.amount,
        balanceBefore,
        balanceAfter,
        description: params.description,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        metadata: params.metadata || {},
      });

      await queryRunner.manager.save(transaction);
      await queryRunner.commitTransaction();

      this.logger.log(`Refunded $${params.amount.toFixed(2)} to tenant ${params.tenantId}`);
      return transaction;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ==================== TRANSACTIONS ====================

  async getTransactions(
    tenantId: string,
    query: TransactionQueryDto
  ): Promise<TransactionListResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (query.type) {
      where.type = query.type;
    }

    if (query.channel) {
      where.channel = query.channel;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
    } else if (query.startDate) {
      where.createdAt = MoreThanOrEqual(new Date(query.startDate));
    } else if (query.endDate) {
      where.createdAt = LessThanOrEqual(new Date(query.endDate));
    }

    const [transactions, total] = await this.transactionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: transactions.map((t) => this.mapTransactionToResponse(t)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ==================== BALANCE CHECKS ====================

  async hasBalance(tenantId: string, amount: number): Promise<boolean> {
    const wallet = await this.walletRepository.findOne({ where: { tenantId } });
    if (!wallet) return false;
    const available = Number(wallet.balance) - Number(wallet.reservedBalance);
    return available >= amount;
  }

  async getAvailableBalance(tenantId: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({ where: { tenantId } });
    if (!wallet) return 0;
    return Number(wallet.balance) - Number(wallet.reservedBalance);
  }

  // ==================== LOW BALANCE ALERT ====================

  private async checkLowBalance(tenantId: string, wallet: Wallet): Promise<void> {
    const availableBalance = Number(wallet.balance) - Number(wallet.reservedBalance);

    if (availableBalance <= Number(wallet.lowBalanceThreshold) && !wallet.lowBalanceAlertSent) {
      // TODO: Send low balance alert email
      wallet.lowBalanceAlertSent = true;
      wallet.lowBalanceAlertSentAt = new Date();
      await this.walletRepository.save(wallet);

      this.logger.warn(`Low balance alert for tenant ${tenantId}: $${availableBalance.toFixed(2)}`);

      // Check for auto-recharge
      if (wallet.autoRechargeEnabled && availableBalance <= Number(wallet.autoRechargeThreshold)) {
        // TODO: Trigger auto-recharge
        this.logger.log(`Auto-recharge triggered for tenant ${tenantId}`);
      }
    }
  }

  // ==================== HELPERS ====================

  private mapWalletToResponse(wallet: Wallet): WalletResponseDto {
    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      reservedBalance: Number(wallet.reservedBalance),
      availableBalance: Number(wallet.balance) - Number(wallet.reservedBalance),
      currency: wallet.currency,
      lowBalanceThreshold: Number(wallet.lowBalanceThreshold),
      autoRechargeEnabled: wallet.autoRechargeEnabled,
      autoRechargeAmount: Number(wallet.autoRechargeAmount),
      autoRechargeThreshold: Number(wallet.autoRechargeThreshold),
      totalCredited: Number(wallet.totalCredited),
      totalDebited: Number(wallet.totalDebited),
      lastToppedUpAt: wallet.lastToppedUpAt,
    };
  }

  private mapTransactionToResponse(transaction: WalletTransaction): TransactionResponseDto {
    return {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      amount: Number(transaction.amount),
      balanceBefore: Number(transaction.balanceBefore),
      balanceAfter: Number(transaction.balanceAfter),
      description: transaction.description,
      channel: transaction.channel,
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      createdAt: transaction.createdAt,
    };
  }
}
