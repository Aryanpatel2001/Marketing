import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { TransactionChannel, TransactionType } from '../entities/wallet-transaction.entity';

export class TopUpWalletDto {
  @ApiProperty({ description: 'Amount to add to wallet', minimum: 5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(5)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Stripe payment method ID (uses default if not provided)' })
  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}

export class CreateTopUpSessionDto {
  @ApiProperty({ description: 'Amount to add to wallet', minimum: 5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(5)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Success redirect URL' })
  @IsString()
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({ description: 'Cancel redirect URL' })
  @IsString()
  @IsOptional()
  cancelUrl?: string;
}

export class UpdateWalletSettingsDto {
  @ApiPropertyOptional({ description: 'Low balance alert threshold' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  lowBalanceThreshold?: number;

  @ApiPropertyOptional({ description: 'Enable auto recharge' })
  @IsOptional()
  autoRechargeEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Auto recharge amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  autoRechargeAmount?: number;

  @ApiPropertyOptional({ description: 'Auto recharge when balance falls below' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  autoRechargeThreshold?: number;
}

export class WalletResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  balance: number;

  @ApiProperty()
  reservedBalance: number;

  @ApiProperty()
  availableBalance: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  lowBalanceThreshold: number;

  @ApiProperty()
  autoRechargeEnabled: boolean;

  @ApiProperty()
  autoRechargeAmount: number;

  @ApiProperty()
  autoRechargeThreshold: number;

  @ApiProperty()
  totalCredited: number;

  @ApiProperty()
  totalDebited: number;

  @ApiProperty({ nullable: true })
  lastToppedUpAt: Date | null;
}

export class TransactionQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionChannel })
  @IsEnum(TransactionChannel)
  @IsOptional()
  channel?: TransactionChannel;

  @ApiPropertyOptional({ description: 'Start date filter' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  @IsString()
  @IsOptional()
  endDate?: string;
}

export class TransactionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty()
  status: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  balanceBefore: number;

  @ApiProperty()
  balanceAfter: number;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  channel: string | null;

  @ApiProperty({ nullable: true })
  referenceType: string | null;

  @ApiProperty({ nullable: true })
  referenceId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class TransactionListResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
