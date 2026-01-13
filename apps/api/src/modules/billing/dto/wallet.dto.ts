import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { TransactionType } from '../entities/wallet-transaction.entity';

export class WalletBalanceDto {
  @ApiProperty({ description: 'Current available balance' })
  balance: number;

  @ApiProperty({ description: 'Credits reserved for pending campaigns' })
  reservedCredits: number;

  @ApiProperty({ description: 'Total available credits (balance - reserved)' })
  availableCredits: number;

  @ApiProperty({ description: 'Total credits received over lifetime' })
  lifetimeCredits: number;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Whether the wallet has low balance' })
  isLowBalance: boolean;

  @ApiProperty({ description: 'Low balance threshold' })
  lowBalanceThreshold: number;
}

export class WalletTransactionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  balanceBefore: number;

  @ApiProperty()
  balanceAfter: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  referenceType?: string;

  @ApiPropertyOptional()
  referenceId?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;
}

export class FilterTransactionsDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  limit?: number;
}
