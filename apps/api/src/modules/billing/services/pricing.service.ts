import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageChannel } from '../dto/usage.dto';

export interface PricingBreakdown {
  channel: UsageChannel;
  messageCount: number;
  unitPrice: number;
  totalCost: number;
  countryCode?: string;
  segments?: number;
}

export interface CampaignCostEstimate {
  totalMessages: number;
  estimatedCost: number;
  breakdown: PricingBreakdown[];
  byCountry?: Record<string, { count: number; cost: number }>;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  // SMS pricing by country (per segment)
  private readonly smsPricing: Record<string, number>;
  private readonly defaultSmsPrice: number;

  // Email pricing (per email)
  private readonly emailPrice: number;

  // WhatsApp pricing (per message)
  private readonly whatsappPrice: number;
  private readonly whatsappConversationFee: number;

  constructor(private readonly configService: ConfigService) {
    // Load pricing from config
    this.smsPricing = this.configService.get('billing.sms.prices') || {
      US: 0.0079,
      CA: 0.0079,
      GB: 0.04,
      IN: 0.0065,
      AU: 0.08,
      DE: 0.09,
      FR: 0.08,
      BR: 0.05,
      MX: 0.03,
      JP: 0.07,
      CN: 0.06,
      KR: 0.05,
      SG: 0.04,
      AE: 0.06,
      ZA: 0.03,
    };

    this.defaultSmsPrice = this.configService.get('billing.sms.defaultPrice') || 0.015;
    this.emailPrice = this.configService.get('billing.email.defaultPrice') || 0.001;
    this.whatsappPrice = this.configService.get('billing.whatsapp.defaultPrice') || 0.02;
    this.whatsappConversationFee =
      this.configService.get('billing.whatsapp.conversationFee') || 0.005;
  }

  // ==================== UNIT PRICING ====================

  getUnitPrice(channel: UsageChannel, countryCode?: string): number {
    switch (channel) {
      case UsageChannel.SMS:
        return this.getSmsPrice(countryCode);
      case UsageChannel.EMAIL:
        return this.emailPrice;
      case UsageChannel.WHATSAPP:
        return this.whatsappPrice;
      default:
        return 0;
    }
  }

  getSmsPrice(countryCode?: string): number {
    if (!countryCode) {
      return this.defaultSmsPrice;
    }
    const code = countryCode.toUpperCase();
    return this.smsPricing[code] ?? this.defaultSmsPrice;
  }

  getEmailPrice(): number {
    return this.emailPrice;
  }

  getWhatsAppPrice(includeConversationFee: boolean = false): number {
    return includeConversationFee
      ? this.whatsappPrice + this.whatsappConversationFee
      : this.whatsappPrice;
  }

  // ==================== COST CALCULATION ====================

  calculateSmsCost(messageCount: number, countryCode?: string, segments: number = 1): number {
    const unitPrice = this.getSmsPrice(countryCode);
    return messageCount * segments * unitPrice;
  }

  calculateEmailCost(emailCount: number): number {
    return emailCount * this.emailPrice;
  }

  calculateWhatsAppCost(messageCount: number, includeConversationFee: boolean = false): number {
    const price = this.getWhatsAppPrice(includeConversationFee);
    return messageCount * price;
  }

  // ==================== CAMPAIGN COST ESTIMATION ====================

  estimateCampaignCost(params: {
    channel: UsageChannel;
    recipientCount: number;
    countryDistribution?: Record<string, number>;
    averageSegments?: number;
  }): CampaignCostEstimate {
    const { channel, recipientCount, countryDistribution, averageSegments = 1 } = params;

    const breakdown: PricingBreakdown[] = [];
    let totalCost = 0;
    const byCountry: Record<string, { count: number; cost: number }> = {};

    switch (channel) {
      case UsageChannel.SMS: {
        if (countryDistribution && Object.keys(countryDistribution).length > 0) {
          // Calculate cost by country
          for (const [country, count] of Object.entries(countryDistribution)) {
            const unitPrice = this.getSmsPrice(country);
            const cost = count * averageSegments * unitPrice;

            breakdown.push({
              channel,
              messageCount: count,
              unitPrice,
              totalCost: cost,
              countryCode: country,
              segments: averageSegments,
            });

            byCountry[country] = { count, cost };
            totalCost += cost;
          }
        } else {
          // Use default pricing
          const unitPrice = this.defaultSmsPrice;
          totalCost = recipientCount * averageSegments * unitPrice;

          breakdown.push({
            channel,
            messageCount: recipientCount,
            unitPrice,
            totalCost,
            segments: averageSegments,
          });
        }
        break;
      }

      case UsageChannel.EMAIL:
        totalCost = recipientCount * this.emailPrice;
        breakdown.push({
          channel,
          messageCount: recipientCount,
          unitPrice: this.emailPrice,
          totalCost,
        });
        break;

      case UsageChannel.WHATSAPP: {
        const whatsappUnitPrice = this.getWhatsAppPrice(true);
        totalCost = recipientCount * whatsappUnitPrice;
        breakdown.push({
          channel,
          messageCount: recipientCount,
          unitPrice: whatsappUnitPrice,
          totalCost,
        });
        break;
      }
    }

    return {
      totalMessages: recipientCount,
      estimatedCost: totalCost,
      breakdown,
      byCountry: Object.keys(byCountry).length > 0 ? byCountry : undefined,
    };
  }

  // ==================== BULK CALCULATION ====================

  calculateBulkSmsCost(messages: Array<{ countryCode?: string; segments?: number }>): number {
    return messages.reduce((total, msg) => {
      const unitPrice = this.getSmsPrice(msg.countryCode);
      const segments = msg.segments || 1;
      return total + unitPrice * segments;
    }, 0);
  }

  // ==================== PRICING TABLE ====================

  getPricingTable(): {
    sms: Record<string, number>;
    email: number;
    whatsapp: { message: number; conversation: number };
  } {
    return {
      sms: { ...this.smsPricing, default: this.defaultSmsPrice },
      email: this.emailPrice,
      whatsapp: {
        message: this.whatsappPrice,
        conversation: this.whatsappConversationFee,
      },
    };
  }

  // ==================== SEGMENT CALCULATION ====================

  calculateSmsSegments(message: string): number {
    const hasUnicode = this.containsUnicode(message);
    const length = message.length;

    if (hasUnicode) {
      // UCS-2 encoding
      if (length <= 70) return 1;
      return Math.ceil(length / 67);
    } else {
      // GSM-7 encoding
      if (length <= 160) return 1;
      return Math.ceil(length / 153);
    }
  }

  private containsUnicode(text: string): boolean {
    // Check if text contains characters outside GSM-7 character set
    // eslint-disable-next-line no-control-regex
    const gsm7Chars =
      /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1B\x20-\x7E€[\]{}\\~^|ÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-Za-zÄÖÑÜ§¿äöñüà]*$/;
    return !gsm7Chars.test(text);
  }

  // ==================== COST FORMATTING ====================

  formatCost(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  }
}
