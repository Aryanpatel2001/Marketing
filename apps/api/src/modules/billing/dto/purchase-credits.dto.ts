import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString, IsEnum } from 'class-validator';

export enum CreditPackage {
  PACK_100 = 'pack_100',
  PACK_500 = 'pack_500',
  PACK_1000 = 'pack_1000',
  PACK_5000 = 'pack_5000',
  CUSTOM = 'custom',
}

export class PurchaseCreditsDto {
  @ApiProperty({
    enum: CreditPackage,
    description: 'Predefined credit package or custom',
    example: CreditPackage.PACK_500,
  })
  @IsEnum(CreditPackage)
  package: CreditPackage;

  @ApiProperty({
    description: 'Custom credit amount (only for CUSTOM package)',
    required: false,
    minimum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(100)
  customAmount?: number;
}

export class PurchaseCreditsResponseDto {
  @ApiProperty({ description: 'Stripe client secret for payment confirmation' })
  clientSecret: string;

  @ApiProperty({ description: 'Payment intent ID' })
  paymentIntentId: string;

  @ApiProperty({ description: 'Amount to be charged in cents' })
  amount: number;

  @ApiProperty({ description: 'Number of credits to be added' })
  credits: number;

  @ApiProperty({ description: 'Currency code' })
  currency: string;
}

export class CreditPackageDto {
  @ApiProperty({ description: 'Package identifier' })
  id: CreditPackage;

  @ApiProperty({ description: 'Number of credits in the package' })
  credits: number;

  @ApiProperty({ description: 'Price in cents' })
  price: number;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Price per credit in this package' })
  pricePerCredit: number;

  @ApiProperty({ description: 'Discount percentage compared to base rate' })
  discountPercent: number;
}
