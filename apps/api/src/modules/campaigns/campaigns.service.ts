import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateCampaignDto, FilterCampaignsDto, UpdateCampaignDto } from './dto';
import { CampaignEvent } from './entities/campaign-event.entity';
import { CampaignMessage, MessageStatus } from './entities/campaign-message.entity';
import { Campaign, CampaignStatus, CampaignType } from './entities/campaign.entity';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>
  ) {}

  // ==================== CAMPAIGNS CRUD ====================

  async create(tenantId: string, userId: string, dto: CreateCampaignDto): Promise<Campaign> {
    let status = CampaignStatus.DRAFT;
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    if (scheduledAt) {
      if (scheduledAt <= new Date()) {
        throw new BadRequestException('Scheduled time must be in the future');
      }
      status = CampaignStatus.SCHEDULED;
    }

    const campaign = this.campaignRepository.create({
      ...dto,
      tenantId,
      createdById: userId,
      status,
      content: dto.content || {},
      contactListIds: dto.contactListIds || [],
      scheduledAt,
    });

    return this.campaignRepository.save(campaign);
  }

  async findAll(
    tenantId: string,
    query: FilterCampaignsDto
  ): Promise<PaginatedResponseDto<Campaign>> {
    const queryBuilder = this.campaignRepository
      .createQueryBuilder('campaign')
      .leftJoinAndSelect('campaign.template', 'template')
      .leftJoinAndSelect('campaign.createdBy', 'createdBy')
      .where('campaign.tenantId = :tenantId', { tenantId })
      .andWhere('campaign.deletedAt IS NULL');

    // Apply filters
    if (query.type) {
      queryBuilder.andWhere('campaign.type = :type', { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere('campaign.status = :status', { status: query.status });
    }

    if (query.fromDate) {
      queryBuilder.andWhere('campaign.createdAt >= :fromDate', {
        fromDate: new Date(query.fromDate),
      });
    }

    if (query.toDate) {
      queryBuilder.andWhere('campaign.createdAt <= :toDate', {
        toDate: new Date(query.toDate),
      });
    }

    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(campaign.name) LIKE LOWER(:search)', {
            search: `%${query.search}%`,
          }).orWhere('LOWER(campaign.description) LIKE LOWER(:search)', {
            search: `%${query.search}%`,
          });
        })
      );
    }

    // Sorting
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'status', 'type', 'scheduledAt'];

    if (allowedSortFields.includes(sortField)) {
      queryBuilder.orderBy(`campaign.${sortField}`, sortOrder);
    } else {
      queryBuilder.orderBy('campaign.createdAt', 'DESC');
    }

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id, tenantId },
      relations: ['template', 'createdBy'],
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async update(tenantId: string, id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);

    // Only allow updates to draft campaigns
    if (campaign.status !== CampaignStatus.DRAFT && dto.status === undefined) {
      throw new BadRequestException('Can only update draft campaigns');
    }

    Object.assign(campaign, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : campaign.scheduledAt,
    });

    return this.campaignRepository.save(campaign);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const campaign = await this.findOne(tenantId, id);

    // Only allow deletion of draft or cancelled campaigns
    if (![CampaignStatus.DRAFT, CampaignStatus.CANCELLED].includes(campaign.status)) {
      throw new BadRequestException('Can only delete draft or cancelled campaigns');
    }

    await this.campaignRepository.softRemove(campaign);
  }

  async duplicate(tenantId: string, id: string, userId: string): Promise<Campaign> {
    const original = await this.findOne(tenantId, id);

    const duplicate = this.campaignRepository.create({
      ...original,
      id: undefined,
      name: `${original.name} (Copy)`,
      status: CampaignStatus.DRAFT,
      createdById: userId,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      pausedAt: null,
      totalRecipients: 0,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      openedCount: 0,
      uniqueOpens: 0,
      clickedCount: 0,
      uniqueClicks: 0,
      bouncedCount: 0,
      unsubscribedCount: 0,
      complainedCount: 0,
      readCount: 0,
      repliedCount: 0,
      createdAt: undefined,
      updatedAt: undefined,
      deletedAt: undefined,
    });

    return this.campaignRepository.save(duplicate);
  }

  // ==================== CAMPAIGN ACTIONS ====================

  async schedule(tenantId: string, id: string, scheduledAt: Date): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Can only schedule draft campaigns');
    }

    // Validate scheduled time is in the future
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }

    campaign.status = CampaignStatus.SCHEDULED;
    campaign.scheduledAt = scheduledAt;
    campaign.sendImmediately = false;

    const savedCampaign = await this.campaignRepository.save(campaign);

    this.logger.log(
      `[CAMPAIGN SCHEDULED] ID: ${campaign.id} | Name: ${campaign.name} | ` +
        `ScheduledFor: ${scheduledAt.toISOString()} | Timezone: ${campaign.timezone || 'UTC'} | ` +
        `Timestamp: ${new Date().toISOString()}`
    );

    return savedCampaign;
  }

  async pause(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);

    if (campaign.status !== CampaignStatus.SENDING) {
      throw new BadRequestException('Can only pause campaigns that are sending');
    }

    campaign.status = CampaignStatus.PAUSED;
    campaign.pausedAt = new Date();

    return this.campaignRepository.save(campaign);
  }

  async resume(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);

    if (campaign.status !== CampaignStatus.PAUSED) {
      throw new BadRequestException('Can only resume paused campaigns');
    }

    campaign.status = CampaignStatus.SENDING;
    campaign.pausedAt = null;

    return this.campaignRepository.save(campaign);
  }

  async cancel(tenantId: string, id: string): Promise<Campaign> {
    const campaign = await this.findOne(tenantId, id);

    if (
      ![CampaignStatus.SCHEDULED, CampaignStatus.SENDING, CampaignStatus.PAUSED].includes(
        campaign.status
      )
    ) {
      throw new BadRequestException('Can only cancel scheduled, sending, or paused campaigns');
    }

    campaign.status = CampaignStatus.CANCELLED;
    campaign.completedAt = new Date();

    return this.campaignRepository.save(campaign);
  }

  // ==================== CAMPAIGN STATS ====================

  async getStats(
    tenantId: string,
    id: string
  ): Promise<{
    campaign: Campaign;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
    unsubscribeRate: number;
  }> {
    const campaign = await this.findOne(tenantId, id);

    const deliveryRate =
      campaign.sentCount > 0 ? (campaign.deliveredCount / campaign.sentCount) * 100 : 0;

    const openRate =
      campaign.deliveredCount > 0 ? (campaign.uniqueOpens / campaign.deliveredCount) * 100 : 0;

    const clickRate =
      campaign.deliveredCount > 0 ? (campaign.uniqueClicks / campaign.deliveredCount) * 100 : 0;

    const bounceRate =
      campaign.sentCount > 0 ? (campaign.bouncedCount / campaign.sentCount) * 100 : 0;

    const unsubscribeRate =
      campaign.deliveredCount > 0
        ? (campaign.unsubscribedCount / campaign.deliveredCount) * 100
        : 0;

    return {
      campaign,
      deliveryRate: Math.round(deliveryRate * 10) / 10,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      bounceRate: Math.round(bounceRate * 10) / 10,
      unsubscribeRate: Math.round(unsubscribeRate * 10) / 10,
    };
  }

  async getMessages(
    tenantId: string,
    campaignId: string,
    options: { page?: number; limit?: number; status?: MessageStatus }
  ): Promise<PaginatedResponseDto<CampaignMessage>> {
    // Verify campaign exists
    await this.findOne(tenantId, campaignId);

    const queryBuilder = this.messageRepository
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.contact', 'contact')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.tenantId = :tenantId', { tenantId });

    if (options.status) {
      queryBuilder.andWhere('message.status = :status', { status: options.status });
    }

    queryBuilder.orderBy('message.createdAt', 'DESC');

    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getEvents(
    tenantId: string,
    campaignId: string,
    options: { page?: number; limit?: number }
  ): Promise<PaginatedResponseDto<CampaignEvent>> {
    // Verify campaign exists
    await this.findOne(tenantId, campaignId);

    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .where('event.campaignId = :campaignId', { campaignId })
      .andWhere('event.tenantId = :tenantId', { tenantId })
      .orderBy('event.createdAt', 'DESC');

    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get activity stats for charting
   * Returns time-series data grouped by hour or day
   */
  async getActivityStats(
    tenantId: string,
    campaignId: string,
    interval: 'hour' | 'day' = 'hour'
  ): Promise<{
    timeline: Array<{
      timestamp: string;
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
      failed: number;
    }>;
  }> {
    // Verify campaign exists
    const campaign = await this.findOne(tenantId, campaignId);

    // Determine the time format based on interval
    const dateFormat =
      interval === 'hour'
        ? "TO_CHAR(event.created_at, 'YYYY-MM-DD HH24:00:00')"
        : "TO_CHAR(event.created_at, 'YYYY-MM-DD')";

    // Query events grouped by time interval
    const eventStats = await this.eventRepository
      .createQueryBuilder('event')
      .select(`${dateFormat} as timestamp`)
      .addSelect(`SUM(CASE WHEN event.event_type = 'sent' THEN 1 ELSE 0 END)`, 'sent')
      .addSelect(`SUM(CASE WHEN event.event_type = 'opened' THEN 1 ELSE 0 END)`, 'opened')
      .addSelect(`SUM(CASE WHEN event.event_type = 'clicked' THEN 1 ELSE 0 END)`, 'clicked')
      .addSelect(`SUM(CASE WHEN event.event_type = 'bounced' THEN 1 ELSE 0 END)`, 'bounced')
      .addSelect(`SUM(CASE WHEN event.event_type = 'failed' THEN 1 ELSE 0 END)`, 'failed')
      .where('event.campaign_id = :campaignId', { campaignId })
      .andWhere('event.tenant_id = :tenantId', { tenantId })
      .groupBy('timestamp')
      .orderBy('timestamp', 'ASC')
      .getRawMany();

    // Convert string counts to numbers
    const timeline = eventStats.map((row) => ({
      timestamp: row.timestamp,
      sent: parseInt(row.sent) || 0,
      opened: parseInt(row.opened) || 0,
      clicked: parseInt(row.clicked) || 0,
      bounced: parseInt(row.bounced) || 0,
      failed: parseInt(row.failed) || 0,
    }));

    return { timeline };
  }

  // ==================== OVERVIEW STATS ====================

  async getOverview(tenantId: string): Promise<{
    total: number;
    byStatus: Record<CampaignStatus, number>;
    byType: Record<CampaignType, number>;
    recentCampaigns: Campaign[];
  }> {
    const campaigns = await this.campaignRepository.find({
      where: { tenantId },
      select: ['id', 'status', 'type', 'createdAt'],
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const byStatus: Record<CampaignStatus, number> = {
      [CampaignStatus.DRAFT]: 0,
      [CampaignStatus.SCHEDULED]: 0,
      [CampaignStatus.SENDING]: 0,
      [CampaignStatus.PAUSED]: 0,
      [CampaignStatus.SENT]: 0,
      [CampaignStatus.CANCELLED]: 0,
      [CampaignStatus.FAILED]: 0,
      [CampaignStatus.PREPARING]: 0,
      [CampaignStatus.READY]: 0,
    };

    const byType: Record<CampaignType, number> = {
      [CampaignType.EMAIL]: 0,
      [CampaignType.SMS]: 0,
      [CampaignType.WHATSAPP]: 0,
    };

    campaigns.forEach((c) => {
      byStatus[c.status]++;
      byType[c.type]++;
    });

    return {
      total: campaigns.length,
      byStatus,
      byType,
      recentCampaigns: campaigns.slice(0, 5),
    };
  }
}
