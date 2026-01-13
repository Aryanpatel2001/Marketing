import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, TenantStatus } from '../../tenants/entities/tenant.entity';

export class SubscriptionDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiPropertyOptional()
  stripeSubscriptionId?: string;

  @ApiPropertyOptional()
  stripeCustomerId?: string;

  @ApiProperty()
  isTrial: boolean;

  @ApiPropertyOptional()
  trialEndsAt?: Date;

  @ApiPropertyOptional()
  currentPeriodStart?: Date;

  @ApiPropertyOptional()
  currentPeriodEnd?: Date;

  @ApiPropertyOptional()
  cancelAtPeriodEnd?: boolean;

  @ApiProperty()
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };
}

export class SubscriptionPlanInfoDto {
  @ApiProperty({ enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  monthlyPrice: number;

  @ApiProperty()
  yearlyPrice: number;

  @ApiPropertyOptional()
  popular?: boolean;

  @ApiProperty()
  features: string[];

  @ApiProperty()
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };
}

export class PaymentMethodDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  stripePaymentMethodId: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  isDefault: boolean;

  @ApiPropertyOptional()
  brand?: string;

  @ApiPropertyOptional()
  lastFour?: string;

  @ApiPropertyOptional()
  expMonth?: number;

  @ApiPropertyOptional()
  expYear?: number;
}

export class InvoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  stripeInvoiceId: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  amountPaid: number;

  @ApiProperty()
  currency: string;

  @ApiPropertyOptional()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  invoiceUrl?: string;

  @ApiPropertyOptional()
  pdfUrl?: string;

  @ApiPropertyOptional()
  dueDate?: Date;

  @ApiPropertyOptional()
  paidAt?: Date;

  @ApiProperty()
  createdAt: Date;
}
