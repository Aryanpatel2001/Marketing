import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { CampaignMessage, MessageStatus } from '../entities/campaign-message.entity';
import { CampaignEvent, EventType } from '../entities/campaign-event.entity';
import { Campaign } from '../entities/campaign.entity';
import { Contact, ChannelStatus } from '@/modules/contacts/entities/contact.entity';

interface TrackingData {
  messageId: string;
  campaignId: string;
  contactId: string;
  tenantId: string;
}

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);
  private readonly apiUrl: string;
  private readonly encryptionKey: Buffer;
  private readonly isProduction: boolean;

  constructor(
    @InjectRepository(CampaignMessage)
    private readonly messageRepository: Repository<CampaignMessage>,
    @InjectRepository(CampaignEvent)
    private readonly eventRepository: Repository<CampaignEvent>,
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource
  ) {
    this.apiUrl = this.configService.get<string>('API_URL') || 'http://localhost:3000';
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    // Use dedicated tracking key or fall back to JWT secret
    const keySource =
      this.configService.get<string>('EMAIL_TRACKING_SECRET') ||
      this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!keySource) {
      if (this.isProduction) {
        throw new Error(
          'EMAIL_TRACKING_SECRET or JWT_ACCESS_SECRET must be configured in production'
        );
      }
      this.logger.warn(
        'No encryption key configured - using insecure default. DO NOT use in production!'
      );
    }

    // Derive a proper 32-byte key using scrypt (done once at startup)
    const salt = this.configService.get<string>('EMAIL_TRACKING_SALT') || 'email-tracking-salt';
    this.encryptionKey = crypto.scryptSync(keySource || 'insecure-dev-only-key', salt, 32);
  }

  /**
   * Generate encrypted tracking token
   */
  generateTrackingToken(data: TrackingData): string {
    const payload = JSON.stringify(data);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Combine IV and encrypted data, then base64url encode
    const combined = iv.toString('hex') + ':' + encrypted;
    return Buffer.from(combined).toString('base64url');
  }

  /**
   * Decrypt tracking token
   */
  decryptTrackingToken(token: string): TrackingData | null {
    try {
      const combined = Buffer.from(token, 'base64url').toString('utf8');
      const [ivHex, encrypted] = combined.split(':');

      if (!ivHex || !encrypted) {
        this.logger.warn('Invalid token format - missing IV or encrypted data');
        return null;
      }

      const iv = Buffer.from(ivHex, 'hex');
      if (iv.length !== 16) {
        this.logger.warn('Invalid IV length');
        return null;
      }

      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted) as TrackingData;

      // Validate required fields
      if (!data.messageId || !data.campaignId || !data.contactId || !data.tenantId) {
        this.logger.warn('Invalid token data - missing required fields');
        return null;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to decrypt tracking token', error);
      return null;
    }
  }

  /**
   * Generate tracking pixel URL
   */
  generateOpenTrackingPixel(
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    const token = this.generateTrackingToken({ messageId, campaignId, contactId, tenantId });
    return `${this.apiUrl}/api/v1/tracking/open/${token}.png`;
  }

  /**
   * Generate click tracking URL
   */
  generateClickTrackingUrl(
    originalUrl: string,
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    const token = this.generateTrackingToken({ messageId, campaignId, contactId, tenantId });
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${this.apiUrl}/api/v1/tracking/click/${token}?url=${encodedUrl}`;
  }

  /**
   * Generate unsubscribe URL
   */
  generateUnsubscribeUrl(
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    const token = this.generateTrackingToken({ messageId, campaignId, contactId, tenantId });
    return `${this.apiUrl}/api/v1/tracking/unsubscribe/${token}`;
  }

  /**
   * Wrap all links in HTML content for click tracking
   */
  wrapLinksForTracking(
    html: string,
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    // Match href attributes in anchor tags
    const linkRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi;

    return html.replace(linkRegex, (match, before, url, after) => {
      // Skip tracking for special URLs
      if (
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('#') ||
        url.includes('unsubscribe') ||
        url.includes('tracking/') // Already a tracking URL
      ) {
        return match;
      }

      const trackingUrl = this.generateClickTrackingUrl(
        url,
        messageId,
        campaignId,
        contactId,
        tenantId
      );
      return `<a ${before}href="${trackingUrl}"${after}>`;
    });
  }

  /**
   * Add tracking pixel to HTML content
   */
  addTrackingPixel(
    html: string,
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    const pixelUrl = this.generateOpenTrackingPixel(messageId, campaignId, contactId, tenantId);
    const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;visibility:hidden;" alt="" />`;

    // Insert before closing body tag, or at the end if no body tag
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    return html + trackingPixel;
  }

  /**
   * Add unsubscribe footer to HTML content
   */
  addUnsubscribeFooter(
    html: string,
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string
  ): string {
    const unsubscribeUrl = this.generateUnsubscribeUrl(messageId, campaignId, contactId, tenantId);

    const footer = `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 12px; color: #666;">
        <p style="margin: 0;">
          You received this email because you're subscribed to our mailing list.
          <br />
          <a href="${unsubscribeUrl}" style="color: #666; text-decoration: underline;">Unsubscribe</a> from future emails.
        </p>
      </div>
    `;

    // Insert before closing body tag, or at the end if no body tag
    if (html.includes('</body>')) {
      return html.replace('</body>', `${footer}</body>`);
    }
    return html + footer;
  }

  /**
   * Process email content with all tracking features
   */
  processEmailForTracking(
    html: string,
    messageId: string,
    campaignId: string,
    contactId: string,
    tenantId: string,
    options: { trackOpens?: boolean; trackClicks?: boolean; addUnsubscribe?: boolean } = {}
  ): string {
    const { trackOpens = true, trackClicks = true, addUnsubscribe = true } = options;

    let processedHtml = html;

    // Wrap links for click tracking
    if (trackClicks) {
      processedHtml = this.wrapLinksForTracking(
        processedHtml,
        messageId,
        campaignId,
        contactId,
        tenantId
      );
    }

    // Add unsubscribe footer
    if (addUnsubscribe) {
      processedHtml = this.addUnsubscribeFooter(
        processedHtml,
        messageId,
        campaignId,
        contactId,
        tenantId
      );
    }

    // Add tracking pixel (must be last to ensure it's at the bottom)
    if (trackOpens) {
      processedHtml = this.addTrackingPixel(
        processedHtml,
        messageId,
        campaignId,
        contactId,
        tenantId
      );
    }

    return processedHtml;
  }

  /**
   * Record an open event with transaction to prevent race conditions
   */
  async recordOpen(
    token: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<boolean> {
    const data = this.decryptTrackingToken(token);
    if (!data) {
      this.logger.warn('Invalid open tracking token');
      return false;
    }

    const { messageId, campaignId, contactId, tenantId } = data;

    // Use transaction to prevent race conditions
    return this.dataSource.transaction(async (manager) => {
      // Check if already opened using SELECT FOR UPDATE to lock the row
      const existingOpen = await manager
        .createQueryBuilder(CampaignEvent, 'event')
        .where('event.campaign_message_id = :messageId', { messageId })
        .andWhere('event.event_type = :eventType', { eventType: EventType.OPENED })
        .setLock('pessimistic_write')
        .getOne();

      const isFirstOpen = !existingOpen;

      // Update message status if first open
      if (isFirstOpen) {
        await manager.update(CampaignMessage, messageId, {
          status: MessageStatus.OPENED,
          openedAt: new Date(),
        });

        // Update campaign unique opens atomically
        await manager
          .createQueryBuilder()
          .update(Campaign)
          .set({ uniqueOpens: () => '"unique_opens" + 1' })
          .where('id = :id', { id: campaignId })
          .execute();
      }

      // Always record the event (for total opens count)
      const event = manager.create(CampaignEvent, {
        campaignMessageId: messageId,
        campaignId,
        contactId,
        tenantId,
        eventType: EventType.OPENED,
        ipAddress: metadata?.ip,
        userAgent: metadata?.userAgent,
        deviceType: this.parseDeviceType(metadata?.userAgent),
        browser: this.parseBrowser(metadata?.userAgent),
        os: this.parseOS(metadata?.userAgent),
      });
      await manager.save(event);

      // Update campaign total opens atomically
      await manager
        .createQueryBuilder()
        .update(Campaign)
        .set({ openedCount: () => '"opened_count" + 1' })
        .where('id = :id', { id: campaignId })
        .execute();

      this.logger.debug(`Recorded open for message ${messageId} (first: ${isFirstOpen})`);
      return true;
    });
  }

  /**
   * Record a click event with transaction to prevent race conditions
   */
  async recordClick(
    token: string,
    url: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<boolean> {
    const data = this.decryptTrackingToken(token);
    if (!data) {
      this.logger.warn('Invalid click tracking token');
      return false;
    }

    const { messageId, campaignId, contactId, tenantId } = data;

    // Use transaction to prevent race conditions
    return this.dataSource.transaction(async (manager) => {
      // Check if first click using SELECT FOR UPDATE to lock the row
      const existingClick = await manager
        .createQueryBuilder(CampaignEvent, 'event')
        .where('event.campaign_message_id = :messageId', { messageId })
        .andWhere('event.event_type = :eventType', { eventType: EventType.CLICKED })
        .setLock('pessimistic_write')
        .getOne();

      const isFirstClick = !existingClick;

      // Update message status if first click
      if (isFirstClick) {
        await manager.update(CampaignMessage, messageId, {
          status: MessageStatus.CLICKED,
          clickedAt: new Date(),
        });

        // Update campaign unique clicks atomically
        await manager
          .createQueryBuilder()
          .update(Campaign)
          .set({ uniqueClicks: () => '"unique_clicks" + 1' })
          .where('id = :id', { id: campaignId })
          .execute();
      }

      // Always record the event
      const event = manager.create(CampaignEvent, {
        campaignMessageId: messageId,
        campaignId,
        contactId,
        tenantId,
        eventType: EventType.CLICKED,
        linkUrl: url,
        ipAddress: metadata?.ip,
        userAgent: metadata?.userAgent,
        deviceType: this.parseDeviceType(metadata?.userAgent),
        browser: this.parseBrowser(metadata?.userAgent),
        os: this.parseOS(metadata?.userAgent),
      });
      await manager.save(event);

      // Update campaign total clicks atomically
      await manager
        .createQueryBuilder()
        .update(Campaign)
        .set({ clickedCount: () => '"clicked_count" + 1' })
        .where('id = :id', { id: campaignId })
        .execute();

      this.logger.debug(
        `Recorded click for message ${messageId}, URL: ${url} (first: ${isFirstClick})`
      );
      return true;
    });
  }

  /**
   * Process unsubscribe
   */
  async processUnsubscribe(
    token: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<{ success: boolean; email?: string }> {
    const data = this.decryptTrackingToken(token);
    if (!data) {
      this.logger.warn('Invalid unsubscribe token');
      return { success: false };
    }

    const { messageId, campaignId, contactId, tenantId } = data;

    // Update contact's email status
    await this.contactRepository.update(
      { id: contactId, tenantId },
      { emailStatus: ChannelStatus.UNSUBSCRIBED }
    );

    // Update message status
    await this.messageRepository.update(messageId, {
      status: MessageStatus.UNSUBSCRIBED,
    });

    // Record event
    const event = this.eventRepository.create({
      campaignMessageId: messageId,
      campaignId,
      contactId,
      tenantId,
      eventType: EventType.UNSUBSCRIBED,
      ipAddress: metadata?.ip,
      userAgent: metadata?.userAgent,
    });
    await this.eventRepository.save(event);

    // Update campaign unsubscribe count
    await this.campaignRepository.increment({ id: campaignId }, 'unsubscribedCount', 1);

    // Get contact email for confirmation
    const contact = await this.contactRepository.findOne({ where: { id: contactId } });

    this.logger.log(`Contact ${contactId} unsubscribed from campaign ${campaignId}`);
    return { success: true, email: contact?.email || undefined };
  }

  /**
   * Parse device type from user agent
   */
  private parseDeviceType(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return 'mobile';
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return 'tablet';
    }
    return 'desktop';
  }

  /**
   * Parse browser from user agent
   */
  private parseBrowser(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    return 'Other';
  }

  /**
   * Parse OS from user agent
   */
  private parseOS(userAgent?: string): string | undefined {
    if (!userAgent) return undefined;

    const ua = userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os') || ua.includes('macos')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';
    return 'Other';
  }
}
