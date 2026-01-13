import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl } from 'class-validator';

export enum BillingInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export enum CheckoutPlan {
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
}

export class CreateCheckoutSessionDto {
  @ApiProperty({
    enum: CheckoutPlan,
    description: 'The subscription plan to purchase',
    example: CheckoutPlan.STARTER,
  })
  @IsEnum(CheckoutPlan)
  plan: CheckoutPlan;

  @ApiProperty({
    enum: BillingInterval,
    description: 'Billing interval - monthly or yearly',
    example: BillingInterval.MONTHLY,
  })
  @IsEnum(BillingInterval)
  interval: BillingInterval;

  @ApiProperty({
    description: 'URL to redirect after successful checkout',
    example: 'https://app.example.com/billing/success',
  })
  @IsUrl({ require_tld: false })
  successUrl: string;

  @ApiProperty({
    description: 'URL to redirect if checkout is cancelled',
    example: 'https://app.example.com/billing/cancel',
  })
  @IsUrl({ require_tld: false })
  cancelUrl: string;
}

export class CreatePortalSessionDto {
  @ApiProperty({
    description: 'URL to redirect after leaving the billing portal',
    example: 'https://app.example.com/settings/billing',
  })
  @IsUrl({ require_tld: false })
  returnUrl: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty({ description: 'Stripe checkout session URL' })
  url: string;

  @ApiProperty({ description: 'Stripe checkout session ID' })
  sessionId: string;
}
