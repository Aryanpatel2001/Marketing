import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export enum UsageChannel {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
}

export class UsageQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ enum: UsageChannel })
  @IsEnum(UsageChannel)
  @IsOptional()
  channel?: UsageChannel;
}

export class ChannelUsageDto {
  @ApiProperty()
  used: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  overage: number;

  @ApiProperty()
  remaining: number;

  @ApiProperty()
  percentUsed: number;

  @ApiProperty()
  cost: number;
}

export class UsageResponseDto {
  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty({ type: ChannelUsageDto })
  sms: ChannelUsageDto;

  @ApiProperty({ type: ChannelUsageDto })
  email: ChannelUsageDto;

  @ApiProperty({ type: ChannelUsageDto })
  whatsapp: ChannelUsageDto;

  @ApiProperty()
  contacts: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };

  @ApiProperty()
  campaigns: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };

  @ApiProperty()
  totalCost: number;
}

export class CostEstimateRequestDto {
  @ApiProperty({ enum: UsageChannel })
  @IsEnum(UsageChannel)
  channel: UsageChannel;

  @ApiProperty({ description: 'Number of messages to send' })
  @IsNumber()
  @Type(() => Number)
  messageCount: number;

  @ApiPropertyOptional({ description: 'Country code for SMS pricing' })
  @IsString()
  @IsOptional()
  countryCode?: string;
}

export class CostEstimateResponseDto {
  @ApiProperty()
  channel: string;

  @ApiProperty()
  messageCount: number;

  @ApiProperty()
  quotaRemaining: number;

  @ApiProperty()
  fromQuota: number;

  @ApiProperty()
  fromWallet: number;

  @ApiProperty()
  unitPrice: number;

  @ApiProperty()
  estimatedCost: number;

  @ApiProperty()
  walletBalance: number;

  @ApiProperty()
  hasSufficientFunds: boolean;

  @ApiProperty()
  shortfall: number;
}

export class UsageSummaryDto {
  @ApiProperty({ nullable: true })
  currentPeriod: UsageResponseDto | null;

  @ApiProperty({ nullable: true })
  subscription: {
    plan: string;
    status: string;
    renewsAt: Date | null;
  } | null;

  @ApiProperty()
  wallet: {
    balance: number;
    currency: string;
  };
}
