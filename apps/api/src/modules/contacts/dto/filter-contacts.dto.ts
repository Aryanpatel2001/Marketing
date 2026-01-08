import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { ContactStatus, ContactSource, ChannelStatus } from '../entities/contact.entity';

export class FilterContactsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by contact status',
    enum: ContactStatus,
  })
  @IsEnum(ContactStatus)
  @IsOptional()
  status?: ContactStatus;

  @ApiPropertyOptional({
    description: 'Filter by contact source',
    enum: ContactSource,
  })
  @IsEnum(ContactSource)
  @IsOptional()
  source?: ContactSource;

  @ApiPropertyOptional({
    description: 'Filter by email status',
    enum: ChannelStatus,
  })
  @IsEnum(ChannelStatus)
  @IsOptional()
  emailStatus?: ChannelStatus;

  @ApiPropertyOptional({
    description: 'Filter by SMS status',
    enum: ChannelStatus,
  })
  @IsEnum(ChannelStatus)
  @IsOptional()
  smsStatus?: ChannelStatus;

  @ApiPropertyOptional({
    description: 'Filter by tags (comma-separated)',
    example: 'vip,newsletter',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((t) => t.trim()) : value
  )
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Filter by contact list ID',
  })
  @IsUUID()
  @IsOptional()
  listId?: string;

  @ApiPropertyOptional({
    description: 'Filter by country',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    description: 'Filter by city',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'Filter contacts with email only',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  hasEmail?: boolean;

  @ApiPropertyOptional({
    description: 'Filter contacts with phone only',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  hasPhone?: boolean;

  // ==================== ADVANCED FILTERS ====================

  @ApiPropertyOptional({
    description: 'Filter contacts created after this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  createdAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter contacts created before this date (ISO 8601)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  createdBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter contacts with last activity after this date',
  })
  @IsDateString()
  @IsOptional()
  lastActivityAfter?: string;

  @ApiPropertyOptional({
    description: 'Filter contacts with last activity before this date',
  })
  @IsDateString()
  @IsOptional()
  lastActivityBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter by minimum engagement score (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minEngagementScore?: number;

  @ApiPropertyOptional({
    description: 'Filter by maximum engagement score (0-100)',
    minimum: 0,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  maxEngagementScore?: number;

  @ApiPropertyOptional({
    description: 'Filter contacts with WhatsApp number',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  hasWhatsapp?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by company name (partial match)',
  })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({
    description: 'Filter contacts never contacted',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  neverContacted?: boolean;

  @ApiPropertyOptional({
    description: 'Filter contacts who opened emails',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  hasOpened?: boolean;

  @ApiPropertyOptional({
    description: 'Filter contacts who clicked emails',
  })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsOptional()
  hasClicked?: boolean;
}
