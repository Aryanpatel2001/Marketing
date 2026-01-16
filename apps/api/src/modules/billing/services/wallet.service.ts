import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RedisService } from '../../../providers/redis/redis.service';
import { FilterTransactionsDto, WalletBalanceDto } from '../dto/wallet.dto';
import { TransactionType, WalletTransaction } from '../entities/wallet-transaction.entity';
import { Wallet } from '../entities/wallet.entity';

const LOW_BALANCE_THRESHOLD = 50;
const REDIS_BALANCE_KEY_PREFIX = 'wallet:balance:';
const REDIS_RESERVED_KEY_PREFIX = 'wallet:reserved:';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactionRepository: Repository<WalletTransaction>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource
  ) {}

  // ============================================
  // Wallet Management
  // ============================================

  async createWallet(tenantId: string): Promise<Wallet> {
    this.logger.log(`Creating wallet for tenant ${tenantId}`);

    const existingWallet = await this.walletRepository.findOne({
      where: { tenantId },
    });

    if (existingWallet) {
      return existingWallet;
    }

    const wallet = this.walletRepository.create({
      tenantId,
      balance: 0,
      reservedCredits: 0,
      lifetimeCredits: 0,
      currency: 'USD',
    });

    const savedWallet = await this.walletRepository.save(wallet);

    // Initialize Redis balance
    await this.syncBalanceToRedis(tenantId, 0, 0);

    return savedWallet;
  }

  async getWallet(tenantId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { tenantId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async getBalance(tenantId: string): Promise<WalletBalanceDto> {
    // Try Redis first for speed
    const redisBalance = await this.getRedisBalance(tenantId);
    const redisReserved = await this.getRedisReserved(tenantId);

    if (redisBalance !== null) {
      const balance = parseFloat(redisBalance);
      const reserved = redisReserved ? parseFloat(redisReserved) : 0;

      return {
        balance,
        reservedCredits: reserved,
        availableCredits: balance - reserved,
        lifetimeCredits: 0, // Will be fetched from DB if needed
        currency: 'USD',
        isLowBalance: balance - reserved < LOW_BALANCE_THRESHOLD,
        lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
      };
    }

    // Fall back to database
    const wallet = await this.getWallet(tenantId);

    // Sync to Redis for future requests
    await this.syncBalanceToRedis(tenantId, wallet.balance, wallet.reservedCredits);

    return {
      balance: Number(wallet.balance),
      reservedCredits: Number(wallet.reservedCredits),
      availableCredits: Number(wallet.balance) - Number(wallet.reservedCredits),
      lifetimeCredits: Number(wallet.lifetimeCredits),
      currency: wallet.currency,
      isLowBalance: Number(wallet.balance) - Number(wallet.reservedCredits) < LOW_BALANCE_THRESHOLD,
      lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
    };
  }

  // ============================================
  // Credit Operations
  // ============================================

  async addCredits(
    tenantId: string,
    amount: number,
    type: TransactionType,
    referenceId?: string,
    metadata?: Record<string, unknown>
  ): Promise<WalletTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    this.logger.log(`Adding ${amount} credits to tenant ${tenantId}`);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(WalletTransaction);

      const wallet = await walletRepo.findOne({
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      // Update wallet
      wallet.balance = balanceAfter;
      wallet.lifetimeCredits = Number(wallet.lifetimeCredits) + amount;
      await walletRepo.save(wallet);

      // Create transaction record
      const transaction = transactionRepo.create({
        tenantId,
        walletId: wallet.id,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        description: this.getTransactionDescription(type, amount),
        referenceId,
        metadata,
      });

      await transactionRepo.save(transaction);

      // Update Redis
      await this.syncBalanceToRedis(tenantId, balanceAfter, Number(wallet.reservedCredits));

      return transaction;
    });
  }

  async deductCredits(
    tenantId: string,
    amount: number,
    campaignId: string,
    messageId: string
  ): Promise<{ success: boolean; newBalance: number }> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    // Try atomic Redis deduction first for speed
    const redisResult = await this.atomicDeductFromRedis(tenantId, amount);

    if (redisResult.success) {
      // Queue database update (async)
      this.queueDatabaseDeduction(tenantId, amount, campaignId, messageId).catch((err) => {
        this.logger.error(`Failed to queue database deduction: ${err.message}`);
      });

      return { success: true, newBalance: redisResult.newBalance };
    }

    // Fall back to database transaction
    return this.deductCreditsFromDatabase(tenantId, amount, campaignId, messageId);
  }

  async reserveCredits(
    tenantId: string,
    amount: number,
    campaignId: string
  ): Promise<{ success: boolean; reserved: number; available: number }> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    this.logger.log(`Reserving ${amount} credits for campaign ${campaignId}`);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(WalletTransaction);

      const wallet = await walletRepo.findOne({
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const balance = Number(wallet.balance);
      const reserved = Number(wallet.reservedCredits);
      const available = balance - reserved;

      if (available < amount) {
        return { success: false, reserved: 0, available };
      }

      // Update reserved amount
      wallet.reservedCredits = reserved + amount;
      await walletRepo.save(wallet);

      // Create reservation transaction
      const transaction = transactionRepo.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.RESERVED,
        amount,
        balanceBefore: balance,
        balanceAfter: balance,
        description: `Reserved for campaign`,
        referenceType: 'campaign',
        referenceId: campaignId,
      });

      await transactionRepo.save(transaction);

      // Update Redis
      await this.syncBalanceToRedis(tenantId, balance, reserved + amount);

      return { success: true, reserved: amount, available: available - amount };
    });
  }

  async releaseReservedCredits(
    tenantId: string,
    amount: number,
    campaignId: string
  ): Promise<void> {
    if (amount <= 0) {
      return;
    }

    this.logger.log(`Releasing ${amount} reserved credits for campaign ${campaignId}`);

    await this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(WalletTransaction);

      const wallet = await walletRepo.findOne({
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const reserved = Number(wallet.reservedCredits);
      const newReserved = Math.max(0, reserved - amount);

      wallet.reservedCredits = newReserved;
      await walletRepo.save(wallet);

      // Create release transaction
      const transaction = transactionRepo.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.RELEASED,
        amount,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance),
        description: `Released from campaign`,
        referenceType: 'campaign',
        referenceId: campaignId,
      });

      await transactionRepo.save(transaction);

      // Update Redis
      await this.syncBalanceToRedis(tenantId, Number(wallet.balance), newReserved);
    });
  }

  async hasBalance(tenantId: string, requiredAmount: number): Promise<boolean> {
    const balance = await this.getBalance(tenantId);
    return balance.availableCredits >= requiredAmount;
  }

  // ============================================
  // Transaction History
  // ============================================

  async getTransactionHistory(
    tenantId: string,
    filters: FilterTransactionsDto
  ): Promise<{ data: WalletTransaction[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.tenantId = :tenantId', { tenantId })
      .orderBy('transaction.createdAt', 'DESC');

    if (filters.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: filters.type });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('transaction.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('transaction.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return { data, total, page, limit };
  }

  // ============================================
  // Private Methods - Redis Operations
  // ============================================

  private async getRedisBalance(tenantId: string): Promise<string | null> {
    return this.redisService.get(`${REDIS_BALANCE_KEY_PREFIX}${tenantId}`);
  }

  private async getRedisReserved(tenantId: string): Promise<string | null> {
    return this.redisService.get(`${REDIS_RESERVED_KEY_PREFIX}${tenantId}`);
  }

  private async syncBalanceToRedis(
    tenantId: string,
    balance: number,
    reserved: number
  ): Promise<void> {
    await Promise.all([
      this.redisService.set(`${REDIS_BALANCE_KEY_PREFIX}${tenantId}`, balance.toString()),
      this.redisService.set(`${REDIS_RESERVED_KEY_PREFIX}${tenantId}`, reserved.toString()),
    ]);
  }

  private async atomicDeductFromRedis(
    tenantId: string,
    amount: number
  ): Promise<{ success: boolean; newBalance: number }> {
    const client = this.redisService.getClient();
    if (!client) {
      return { success: false, newBalance: 0 };
    }

    const balanceKey = `${REDIS_BALANCE_KEY_PREFIX}${tenantId}`;
    const reservedKey = `${REDIS_RESERVED_KEY_PREFIX}${tenantId}`;

    try {
      // Lua script for atomic check-and-deduct
      const script = `
        local balance = tonumber(redis.call('get', KEYS[1]) or '0')
        local reserved = tonumber(redis.call('get', KEYS[2]) or '0')
        local amount = tonumber(ARGV[1])
        local available = balance - reserved

        if available >= amount then
          local newBalance = balance - amount
          redis.call('set', KEYS[1], tostring(newBalance))
          return newBalance
        end
        return -1
      `;

      const result = await client.eval(script, 2, balanceKey, reservedKey, amount.toString());

      if (typeof result === 'number' && result >= 0) {
        return { success: true, newBalance: result };
      }

      return { success: false, newBalance: 0 };
    } catch (error) {
      this.logger.error('Redis atomic deduct failed:', error);
      return { success: false, newBalance: 0 };
    }
  }

  // ============================================
  // Private Methods - Database Operations
  // ============================================

  private async queueDatabaseDeduction(
    tenantId: string,
    amount: number,
    campaignId: string,
    messageId: string
  ): Promise<void> {
    // In a production system, this would publish to a queue
    // For now, we do a direct database update
    await this.deductCreditsFromDatabase(tenantId, amount, campaignId, messageId);
  }

  private async deductCreditsFromDatabase(
    tenantId: string,
    amount: number,
    campaignId: string,
    messageId: string
  ): Promise<{ success: boolean; newBalance: number }> {
    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const transactionRepo = manager.getRepository(WalletTransaction);

      const wallet = await walletRepo.findOne({
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        return { success: false, newBalance: 0 };
      }

      const balance = Number(wallet.balance);
      const reserved = Number(wallet.reservedCredits);
      const available = balance - reserved;

      if (available < amount) {
        return { success: false, newBalance: balance };
      }

      const newBalance = balance - amount;
      wallet.balance = newBalance;
      await walletRepo.save(wallet);

      // Create transaction record
      const transaction = transactionRepo.create({
        tenantId,
        walletId: wallet.id,
        type: TransactionType.SMS_DEDUCTION,
        amount: -amount,
        balanceBefore: balance,
        balanceAfter: newBalance,
        description: 'SMS sent',
        referenceType: 'campaign',
        referenceId: campaignId,
        metadata: { messageId },
      });

      await transactionRepo.save(transaction);

      return { success: true, newBalance };
    });
  }

  private getTransactionDescription(type: TransactionType, amount: number): string {
    switch (type) {
      case TransactionType.CREDIT_PURCHASE:
        return `Purchased ${amount} credits`;
      case TransactionType.SUBSCRIPTION_CREDIT:
        return `Subscription credits: ${amount}`;
      case TransactionType.SMS_DEDUCTION:
        return 'SMS sent';
      case TransactionType.SMS_REFUND:
        return 'SMS refund';
      case TransactionType.EMAIL_DEDUCTION:
        return 'Email sent';
      case TransactionType.EMAIL_REFUND:
        return 'Email refund';
      case TransactionType.MANUAL_ADJUSTMENT:
        return `Manual adjustment: ${amount > 0 ? '+' : ''}${amount}`;
      case TransactionType.RESERVED:
        return 'Credits reserved for campaign';
      case TransactionType.RELEASED:
        return 'Reserved credits released';
      case TransactionType.REFUND:
        return `Refund: ${Math.abs(amount)} credits deducted`;
      case TransactionType.TRIAL_CREDIT:
        return `Trial credits: ${amount}`;
      default:
        return `Transaction: ${amount}`;
    }
  }
}
