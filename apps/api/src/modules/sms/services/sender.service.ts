import { SubscriptionPlan, Tenant } from '@/modules/tenants/entities/tenant.entity';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Twilio from 'twilio';
import { Repository } from 'typeorm';
import {
  AddExistingNumberDto,
  AvailableNumberDto,
  ListSendersQueryDto,
  PlanLimitsResponseDto,
  PurchaseNumberDto,
  RegisterSenderIdDto,
  SearchAvailableNumbersDto,
  UpdateSenderDto,
} from '../dto/sender.dto';
import { SmsSender, SmsSenderStatus, SmsSenderType } from '../entities/sms-sender.entity';

interface PlanLimits {
  maxDedicatedNumbers: number;
  maxTollFreeNumbers: number;
  senderIdsAllowed: boolean;
}

const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  [SubscriptionPlan.FREE]: {
    maxDedicatedNumbers: 1,
    maxTollFreeNumbers: 0,
    senderIdsAllowed: false,
  },
  [SubscriptionPlan.STARTER]: {
    maxDedicatedNumbers: 2,
    maxTollFreeNumbers: 0,
    senderIdsAllowed: false,
  },
  [SubscriptionPlan.GROWTH]: {
    maxDedicatedNumbers: 3,
    maxTollFreeNumbers: 1,
    senderIdsAllowed: false,
  },
  [SubscriptionPlan.PRO]: {
    maxDedicatedNumbers: 5,
    maxTollFreeNumbers: 2,
    senderIdsAllowed: false,
  },
  [SubscriptionPlan.ENTERPRISE]: {
    maxDedicatedNumbers: -1, // Unlimited
    maxTollFreeNumbers: -1, // Unlimited
    senderIdsAllowed: true,
  },
};

@Injectable()
export class SenderService {
  private readonly logger = new Logger(SenderService.name);
  private twilioClient: Twilio.Twilio | null = null;

  constructor(
    @InjectRepository(SmsSender)
    private readonly senderRepository: Repository<SmsSender>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly configService: ConfigService
  ) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (accountSid && authToken) {
      this.twilioClient = Twilio(accountSid, authToken);
      this.logger.log('Twilio client initialized for sender service');
    } else {
      this.logger.warn('Twilio credentials not configured for sender service');
    }
  }

  // ============================================
  // Search Available Numbers
  // ============================================

  async searchAvailableNumbers(
    tenantId: string,
    dto: SearchAvailableNumbersDto
  ): Promise<AvailableNumberDto[]> {
    if (!this.twilioClient) {
      throw new BadRequestException('SMS provider not configured');
    }

    // Check plan limits before searching
    const limits = await this.getPlanLimits(tenantId);
    if (dto.type === 'toll_free' && !limits.canPurchaseTollFree) {
      throw new ForbiddenException('Your plan does not allow toll-free numbers');
    }
    if (dto.type !== 'toll_free' && !limits.canPurchaseDedicated) {
      throw new ForbiddenException('You have reached the maximum number of dedicated numbers');
    }

    try {
      const searchParams: any = {
        limit: dto.limit || 10,
        smsEnabled: true,
      };

      if (dto.areaCode) {
        searchParams.areaCode = dto.areaCode;
      }
      if (dto.contains) {
        searchParams.contains = dto.contains;
      }

      let numbers: any[];

      if (dto.type === 'toll_free') {
        numbers = await this.twilioClient
          .availablePhoneNumbers(dto.country)
          .tollFree.list(searchParams);
      } else if (dto.type === 'mobile') {
        numbers = await this.twilioClient
          .availablePhoneNumbers(dto.country)
          .mobile.list(searchParams);
      } else {
        numbers = await this.twilioClient
          .availablePhoneNumbers(dto.country)
          .local.list(searchParams);
      }

      return numbers.map((num) => ({
        phoneNumber: num.phoneNumber,
        country: dto.country,
        region: num.region || num.locality || '',
        type: dto.type,
        monthlyPrice: dto.type === 'toll_free' ? 2.0 : 1.0, // Approximate pricing
        capabilities: {
          sms: num.capabilities?.sms || true,
          voice: num.capabilities?.voice || false,
          mms: num.capabilities?.mms || false,
        },
      }));
    } catch (error: any) {
      this.logger.error(`Failed to search available numbers: ${error.message}`);
      throw new BadRequestException(`Failed to search numbers: ${error.message}`);
    }
  }

  // ============================================
  // Purchase Number
  // ============================================

  async purchaseNumber(tenantId: string, dto: PurchaseNumberDto): Promise<SmsSender> {
    if (!this.twilioClient) {
      throw new BadRequestException('SMS provider not configured');
    }

    // Determine number type
    const isTollFree = this.isTollFreeNumber(dto.phoneNumber);
    const senderType = isTollFree ? SmsSenderType.TOLL_FREE : SmsSenderType.DEDICATED_NUMBER;

    // Check plan limits
    const limits = await this.getPlanLimits(tenantId);
    if (isTollFree && !limits.canPurchaseTollFree) {
      throw new ForbiddenException('Your plan does not allow toll-free numbers or limit reached');
    }
    if (!isTollFree && !limits.canPurchaseDedicated) {
      throw new ForbiddenException('You have reached the maximum number of dedicated numbers');
    }

    // Check if number already purchased
    const existingSender = await this.senderRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existingSender) {
      throw new BadRequestException('This phone number is already in use');
    }

    try {
      // Purchase the number from Twilio
      this.logger.log(`Purchasing phone number ${dto.phoneNumber} for tenant ${tenantId}`);

      const purchasedNumber = await this.twilioClient.incomingPhoneNumbers.create({
        phoneNumber: dto.phoneNumber,
        friendlyName: dto.friendlyName || `Tenant ${tenantId}`,
      });

      // Determine if this should be the default
      const existingCount = await this.senderRepository.count({
        where: { tenantId, status: SmsSenderStatus.ACTIVE },
      });
      const isDefault = existingCount === 0;

      // Create sender record
      const sender = this.senderRepository.create({
        tenantId,
        type: senderType,
        phoneNumber: purchasedNumber.phoneNumber,
        twilioSid: purchasedNumber.sid,
        countryCode: this.extractCountryCode(purchasedNumber.phoneNumber),
        friendlyName:
          dto.friendlyName || purchasedNumber.friendlyName || purchasedNumber.phoneNumber,
        status: SmsSenderStatus.ACTIVE,
        monthlyPrice: isTollFree ? 2.0 : 1.0,
        isDefault,
        capabilities: {
          sms: purchasedNumber.capabilities?.sms || true,
          voice: purchasedNumber.capabilities?.voice || false,
          mms: purchasedNumber.capabilities?.mms || false,
        },
        purchasedAt: new Date(),
        renewsAt: this.getNextRenewalDate(),
      });

      const savedSender = await this.senderRepository.save(sender);
      this.logger.log(`Successfully purchased number ${dto.phoneNumber} (ID: ${sender.id})`);

      return savedSender as SmsSender;
    } catch (error: any) {
      this.logger.error(`Failed to purchase number ${dto.phoneNumber}: ${error.message}`);
      throw new BadRequestException(`Failed to purchase number: ${error.message}`);
    }
  }

  // ============================================
  // Add Existing Number (Trial Account Support)
  // ============================================

  async addExistingNumber(tenantId: string, dto: AddExistingNumberDto): Promise<SmsSender> {
    // Determine number type
    const isTollFree = this.isTollFreeNumber(dto.phoneNumber);
    const senderType = isTollFree ? SmsSenderType.TOLL_FREE : SmsSenderType.DEDICATED_NUMBER;

    // Check plan limits
    const limits = await this.getPlanLimits(tenantId);
    if (isTollFree && !limits.canPurchaseTollFree) {
      throw new ForbiddenException('Your plan does not allow toll-free numbers or limit reached');
    }
    if (!isTollFree && !limits.canPurchaseDedicated) {
      throw new ForbiddenException('You have reached the maximum number of dedicated numbers');
    }

    // Check if number already exists for this tenant - return existing if found
    const existingSenderForTenant = await this.senderRepository.findOne({
      where: { phoneNumber: dto.phoneNumber, tenantId },
    });
    if (existingSenderForTenant) {
      this.logger.log(
        `Phone number ${dto.phoneNumber} already exists for tenant ${tenantId}, returning existing`
      );
      return existingSenderForTenant;
    }

    // Check if number exists for another tenant (shared trial number scenario)
    const existingSenderGlobal = await this.senderRepository.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existingSenderGlobal) {
      // For trial/shared numbers, we can't have the same number for multiple tenants
      // due to the unique constraint. Inform the user.
      throw new BadRequestException(
        'This phone number is already registered in the system. ' +
          'Each phone number can only be registered once. ' +
          'Please use a different number or contact support.'
      );
    }

    // Determine if this should be the default
    const existingCount = await this.senderRepository.count({
      where: { tenantId, status: SmsSenderStatus.ACTIVE },
    });
    const isDefault = existingCount === 0;

    // Create sender record without purchasing from Twilio
    // This is for trial accounts or existing numbers
    const sender = this.senderRepository.create({
      tenantId,
      type: senderType,
      phoneNumber: dto.phoneNumber,
      twilioSid: null, // No Twilio SID for manually added numbers
      countryCode: this.extractCountryCode(dto.phoneNumber),
      friendlyName: dto.friendlyName || `Trial Number ${dto.phoneNumber}`,
      status: SmsSenderStatus.ACTIVE,
      monthlyPrice: 0, // Trial numbers don't have a monthly cost through us
      isDefault,
      capabilities: {
        sms: true,
        voice: true,
        mms: true,
      },
      purchasedAt: new Date(),
      renewsAt: null, // Trial numbers don't renew
    });

    const savedSender = await this.senderRepository.save(sender);
    this.logger.log(`Added existing number ${dto.phoneNumber} for tenant ${tenantId} (Trial Mode)`);

    return savedSender as SmsSender;
  }

  // ============================================
  // Auto-Setup Trial Number from Environment
  // ============================================

  async setupTrialNumberFromEnv(tenantId: string): Promise<SmsSender | null> {
    const trialNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER');

    if (!trialNumber) {
      this.logger.warn('No TWILIO_PHONE_NUMBER configured in environment');
      return null;
    }

    // Check if already exists for this tenant
    const existingSender = await this.senderRepository.findOne({
      where: { phoneNumber: trialNumber, tenantId },
    });

    if (existingSender) {
      this.logger.log(`Trial number ${trialNumber} already registered for tenant ${tenantId}`);
      return existingSender;
    }

    // Check if trial number already exists globally (used by another tenant)
    const globalExisting = await this.senderRepository.findOne({
      where: { phoneNumber: trialNumber },
    });

    if (globalExisting) {
      this.logger.warn(
        `Trial number ${trialNumber} already registered by another tenant. ` +
          `Cannot setup for tenant ${tenantId}. Each tenant needs their own number.`
      );
      return null;
    }

    // Add the trial number
    try {
      return await this.addExistingNumber(tenantId, {
        phoneNumber: trialNumber,
        friendlyName: 'Twilio Trial Number',
      });
    } catch (error: any) {
      // Handle race condition where another tenant registered it
      if (error.code === '23505') {
        this.logger.warn(
          `Trial number ${trialNumber} was registered by another tenant concurrently`
        );
        return null;
      }
      throw error;
    }
  }

  // ============================================
  // Register Sender ID (Enterprise Only)
  // ============================================

  async registerSenderId(tenantId: string, dto: RegisterSenderIdDto): Promise<SmsSender> {
    // Check if Enterprise plan
    const limits = await this.getPlanLimits(tenantId);
    if (!limits.senderIdsAllowed) {
      throw new ForbiddenException('Sender IDs are only available on Enterprise plan');
    }

    // Validate sender ID format
    if (!/^[a-zA-Z0-9]{3,11}$/.test(dto.senderId)) {
      throw new BadRequestException('Sender ID must be 3-11 alphanumeric characters');
    }

    // Check for existing sender ID with same name
    const existingSenderId = await this.senderRepository.findOne({
      where: {
        tenantId,
        senderId: dto.senderId.toUpperCase(),
        type: SmsSenderType.SENDER_ID,
      },
    });
    if (existingSenderId) {
      throw new BadRequestException('You already have a sender ID with this name');
    }

    // Create sender ID (starts as PENDING, requires admin approval)
    const sender = this.senderRepository.create({
      tenantId,
      type: SmsSenderType.SENDER_ID,
      senderId: dto.senderId.toUpperCase(),
      senderIdCountries: dto.countries,
      friendlyName: dto.friendlyName || dto.senderId,
      status: SmsSenderStatus.PENDING,
      isDefault: false,
      capabilities: { sms: true, voice: false, mms: false },
    });

    const savedSender = await this.senderRepository.save(sender);
    this.logger.log(
      `Sender ID ${dto.senderId} registered for tenant ${tenantId}, pending approval`
    );

    return savedSender;
  }

  // ============================================
  // Release/Delete Sender
  // ============================================

  async releaseSender(tenantId: string, senderId: string): Promise<void> {
    const sender = await this.senderRepository.findOne({
      where: { id: senderId, tenantId },
    });

    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    // If it's a phone number, release it from Twilio
    if (sender.twilioSid && this.twilioClient) {
      try {
        await this.twilioClient.incomingPhoneNumbers(sender.twilioSid).remove();
        this.logger.log(`Released phone number ${sender.phoneNumber} from Twilio`);
      } catch (error: any) {
        this.logger.error(`Failed to release number from Twilio: ${error.message}`);
        // Continue with soft delete even if Twilio release fails
      }
    }

    // If this was the default, assign another sender as default
    if (sender.isDefault) {
      const nextDefault = await this.senderRepository.findOne({
        where: {
          tenantId,
          status: SmsSenderStatus.ACTIVE,
        },
        order: { createdAt: 'ASC' },
      });
      if (nextDefault) {
        nextDefault.isDefault = true;
        await this.senderRepository.save(nextDefault);
      }
    }

    // Soft delete the sender
    sender.status = SmsSenderStatus.RELEASED;
    await this.senderRepository.softRemove(sender);
    this.logger.log(`Sender ${senderId} released for tenant ${tenantId}`);
  }

  // ============================================
  // List Senders
  // ============================================

  async listSenders(
    tenantId: string,
    query: ListSendersQueryDto
  ): Promise<{ data: SmsSender[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.senderRepository
      .createQueryBuilder('sender')
      .where('sender.tenantId = :tenantId', { tenantId })
      .orderBy('sender.isDefault', 'DESC')
      .addOrderBy('sender.createdAt', 'DESC');

    if (query.type) {
      queryBuilder.andWhere('sender.type = :type', { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere('sender.status = :status', { status: query.status });
    }

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return { data, total, page, limit };
  }

  // ============================================
  // Get Single Sender
  // ============================================

  async getSender(tenantId: string, senderId: string): Promise<SmsSender> {
    // Check if senderId looks like a phone number (starts with +)
    const isPhoneNumber = senderId.startsWith('+');

    let sender: SmsSender | null = null;

    if (isPhoneNumber) {
      // Look up by phone number (backward compatibility)
      sender = await this.senderRepository.findOne({
        where: { phoneNumber: senderId, tenantId },
      });
    } else {
      // Look up by UUID
      sender = await this.senderRepository.findOne({
        where: { id: senderId, tenantId },
      });
    }

    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    return sender;
  }

  // ============================================
  // Update Sender
  // ============================================

  async updateSender(tenantId: string, senderId: string, dto: UpdateSenderDto): Promise<SmsSender> {
    const sender = await this.getSender(tenantId, senderId);

    if (dto.friendlyName !== undefined) {
      sender.friendlyName = dto.friendlyName;
    }

    if (dto.isDefault === true) {
      // Remove default from other senders
      await this.senderRepository.update({ tenantId, isDefault: true }, { isDefault: false });
      sender.isDefault = true;
    }

    return this.senderRepository.save(sender);
  }

  // ============================================
  // Set Default Sender
  // ============================================

  async setDefaultSender(tenantId: string, senderId: string): Promise<SmsSender> {
    const sender = await this.getSender(tenantId, senderId);

    if (sender.status !== SmsSenderStatus.ACTIVE) {
      throw new BadRequestException('Only active senders can be set as default');
    }

    // Remove default from all other senders
    await this.senderRepository.update({ tenantId, isDefault: true }, { isDefault: false });

    // Set this sender as default
    sender.isDefault = true;
    return this.senderRepository.save(sender);
  }

  // ============================================
  // Get Default Sender for Tenant
  // ============================================

  async getDefaultSender(tenantId: string): Promise<SmsSender | null> {
    // First try to get the explicitly set default
    let sender = await this.senderRepository.findOne({
      where: { tenantId, isDefault: true, status: SmsSenderStatus.ACTIVE },
    });

    if (!sender) {
      // Fall back to the first active sender
      sender = await this.senderRepository.findOne({
        where: { tenantId, status: SmsSenderStatus.ACTIVE },
        order: { createdAt: 'ASC' },
      });
    }

    return sender;
  }

  // ============================================
  // Get Plan Limits
  // ============================================

  async getPlanLimits(tenantId: string): Promise<PlanLimitsResponseDto> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planLimits = PLAN_LIMITS[tenant.plan] || PLAN_LIMITS[SubscriptionPlan.FREE];

    // Count current senders
    const [dedicatedCount, tollFreeCount, senderIdCount] = await Promise.all([
      this.senderRepository.count({
        where: { tenantId, type: SmsSenderType.DEDICATED_NUMBER, status: SmsSenderStatus.ACTIVE },
      }),
      this.senderRepository.count({
        where: { tenantId, type: SmsSenderType.TOLL_FREE, status: SmsSenderStatus.ACTIVE },
      }),
      this.senderRepository.count({
        where: { tenantId, type: SmsSenderType.SENDER_ID },
      }),
    ]);

    return {
      maxDedicatedNumbers: planLimits.maxDedicatedNumbers,
      maxTollFreeNumbers: planLimits.maxTollFreeNumbers,
      senderIdsAllowed: planLimits.senderIdsAllowed,
      currentDedicatedNumbers: dedicatedCount,
      currentTollFreeNumbers: tollFreeCount,
      currentSenderIds: senderIdCount,
      canPurchaseDedicated:
        planLimits.maxDedicatedNumbers === -1 || dedicatedCount < planLimits.maxDedicatedNumbers,
      canPurchaseTollFree:
        planLimits.maxTollFreeNumbers === -1 || tollFreeCount < planLimits.maxTollFreeNumbers,
      canRegisterSenderId: planLimits.senderIdsAllowed,
    };
  }

  // ============================================
  // Admin: Get Pending Sender IDs
  // ============================================

  async getPendingSenderIds(): Promise<SmsSender[]> {
    return this.senderRepository.find({
      where: {
        type: SmsSenderType.SENDER_ID,
        status: SmsSenderStatus.PENDING,
      },
      relations: ['tenant'],
      order: { createdAt: 'ASC' },
    });
  }

  // ============================================
  // Admin: Update Sender Status
  // ============================================

  async adminUpdateSenderStatus(
    senderId: string,
    status: SmsSenderStatus,
    adminNotes?: string,
    rejectionReason?: string
  ): Promise<SmsSender> {
    const sender = await this.senderRepository.findOne({
      where: { id: senderId },
    });

    if (!sender) {
      throw new NotFoundException('Sender not found');
    }

    sender.status = status;
    if (adminNotes) {
      sender.adminNotes = adminNotes;
    }
    if (rejectionReason) {
      sender.rejectionReason = rejectionReason;
    }

    // If approving a sender ID and it should be default
    if (status === SmsSenderStatus.ACTIVE && sender.type === SmsSenderType.SENDER_ID) {
      const hasActiveSender = await this.senderRepository.count({
        where: { tenantId: sender.tenantId, status: SmsSenderStatus.ACTIVE },
      });
      if (hasActiveSender === 0) {
        sender.isDefault = true;
      }
    }

    return this.senderRepository.save(sender);
  }

  // ============================================
  // Update Sender Metrics
  // ============================================

  async updateSenderMetrics(senderId: string, delivered: boolean): Promise<void> {
    const sender = await this.senderRepository.findOne({ where: { id: senderId } });
    if (!sender) return;

    sender.messagesSent += 1;
    sender.lastUsedAt = new Date();

    // Update delivery rate (rolling average)
    const totalMessages = sender.messagesSent;
    const currentDelivered = Math.round((sender.deliveryRate * (totalMessages - 1)) / 100);
    const newDelivered = delivered ? currentDelivered + 1 : currentDelivered;
    sender.deliveryRate = (newDelivered / totalMessages) * 100;

    await this.senderRepository.save(sender);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private isTollFreeNumber(phoneNumber: string): boolean {
    // US/Canada toll-free prefixes
    const tollFreePrefixes = ['800', '888', '877', '866', '855', '844', '833'];
    const withoutCountryCode = phoneNumber.replace(/^\+1/, '');
    return tollFreePrefixes.some((prefix) => withoutCountryCode.startsWith(prefix));
  }

  private extractCountryCode(phoneNumber: string): string {
    // Simple extraction - assumes E.164 format
    if (phoneNumber.startsWith('+1')) return 'US'; // US/Canada
    if (phoneNumber.startsWith('+44')) return 'GB';
    if (phoneNumber.startsWith('+61')) return 'AU';
    if (phoneNumber.startsWith('+91')) return 'IN';
    // Add more as needed
    return 'US';
  }

  private getNextRenewalDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
}
