import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PlanTier } from '../entities/subscription-plan.entity';

export class CreateSubscriptionDto {
  @ApiProperty({ enum: PlanTier, description: 'Plan tier to subscribe to' })
  @IsEnum(PlanTier)
  @IsNotEmpty()
  planTier: PlanTier;

  @ApiPropertyOptional({ description: 'Stripe payment method ID' })
  @IsString()
  @IsOptional()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Coupon code for discount' })
  @IsString()
  @IsOptional()
  couponCode?: string;
}

export class UpdateSubscriptionDto {
  @ApiProperty({ enum: PlanTier, description: 'New plan tier' })
  @IsEnum(PlanTier)
  @IsNotEmpty()
  planTier: PlanTier;

  @ApiPropertyOptional({ description: 'Prorate the change immediately' })
  @IsOptional()
  prorate?: boolean;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ description: 'Cancel at period end or immediately' })
  @IsOptional()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateCheckoutSessionDto {
  @ApiProperty({ enum: PlanTier, description: 'Plan tier for checkout' })
  @IsEnum(PlanTier)
  @IsNotEmpty()
  planTier: PlanTier;

  @ApiPropertyOptional({ description: 'Success redirect URL' })
  @IsString()
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Cancel redirect URL' })
  @IsString()
  @IsOptional()
  cancelUrl?: string;
}

export class SubscriptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  planId: string;

  @ApiProperty()
  planName: string;

  @ApiProperty({ enum: PlanTier })
  planTier: PlanTier;

  @ApiProperty()
  status: string;

  @ApiProperty({ nullable: true })
  currentPeriodStart: Date | null;

  @ApiProperty({ nullable: true })
  currentPeriodEnd: Date | null;

  @ApiProperty({ nullable: true })
  trialEnd: Date | null;

  @ApiProperty()
  cancelAtPeriodEnd: boolean;

  @ApiProperty({ nullable: true })
  cancelledAt: Date | null;

  @ApiProperty()
  price: number;

  @ApiProperty()
  interval: string;
}

export class PlanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: PlanTier })
  tier: PlanTier;

  @ApiProperty()
  description: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  interval: string;

  @ApiProperty()
  smsQuota: number;

  @ApiProperty()
  emailQuota: number;

  @ApiProperty()
  whatsappQuota: number;

  @ApiProperty()
  maxContacts: number;

  @ApiProperty()
  maxSenders: number;

  @ApiProperty()
  maxUsers: number;

  @ApiProperty()
  features: Record<string, boolean>;

  @ApiProperty()
  trialDays: number;
}

export class InvoiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  invoiceNumber: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  amountPaid: number;

  @ApiProperty()
  amountDue: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ nullable: true })
  invoiceUrl: string | null;

  @ApiProperty({ nullable: true })
  pdfUrl: string | null;

  @ApiProperty({ nullable: true })
  periodStart: Date | null;

  @ApiProperty({ nullable: true })
  periodEnd: Date | null;

  @ApiProperty({ nullable: true })
  dueDate: Date | null;

  @ApiProperty({ nullable: true })
  paidAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class InvoiceListResponseDto {
  @ApiProperty({ type: [InvoiceResponseDto] })
  data: InvoiceResponseDto[];

  @ApiProperty()
  total: number;
}
