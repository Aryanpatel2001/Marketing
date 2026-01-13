import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SmsSenderStatus, SmsSenderType } from '../entities/sms-sender.entity';

// ============================================
// Utility DTOs (Phone Validation, Segments)
// ============================================

export class ValidatePhoneDto {
  @ApiProperty({ description: 'Phone number to validate', example: '+14155551234' })
  @IsString()
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'Default country code', example: 'US' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class CalculateSegmentsDto {
  @ApiProperty({ description: 'SMS message to calculate segments for' })
  @IsString()
  message: string;
}

// ============================================
// Search Available Numbers
// ============================================

export class SearchAvailableNumbersDto {
  @ApiProperty({ description: 'Country code (ISO 3166-1 alpha-2)', example: 'US' })
  @IsString()
  @Length(2, 2)
  country: string;

  @ApiProperty({
    description: 'Number type',
    enum: ['local', 'mobile', 'toll_free'],
    example: 'local',
  })
  @IsEnum(['local', 'mobile', 'toll_free'])
  type: 'local' | 'mobile' | 'toll_free';

  @ApiPropertyOptional({ description: 'Area code filter', example: '415' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ description: 'Contains pattern filter', example: '777' })
  @IsOptional()
  @IsString()
  contains?: string;

  @ApiPropertyOptional({ description: 'Number of results to return', default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class AvailableNumberDto {
  @ApiProperty({ example: '+14155551234' })
  phoneNumber: string;

  @ApiProperty({ example: 'US' })
  country: string;

  @ApiProperty({ example: '415' })
  region: string;

  @ApiProperty({ example: 'local' })
  type: 'local' | 'mobile' | 'toll_free';

  @ApiProperty({ example: 1.0 })
  monthlyPrice: number;

  @ApiProperty({ example: { sms: true, voice: true, mms: false } })
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
}

// ============================================
// Purchase Number
// ============================================

export class PurchaseNumberDto {
  @ApiProperty({ description: 'Phone number to purchase in E.164 format', example: '+14155551234' })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone number must be in E.164 format' })
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'Friendly name for the number', example: 'Marketing Main' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  friendlyName?: string;
}

// ============================================
// Add Existing Number (Trial Account Support)
// ============================================

export class AddExistingNumberDto {
  @ApiProperty({
    description: 'Phone number in E.164 format (your Twilio trial number)',
    example: '+14155551234',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone number must be in E.164 format' })
  phoneNumber: string;

  @ApiPropertyOptional({ description: 'Friendly name for the number', example: 'Trial Number' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  friendlyName?: string;

  @ApiPropertyOptional({
    description: 'Number type',
    enum: ['local', 'mobile', 'toll_free'],
    default: 'local',
  })
  @IsOptional()
  @IsEnum(['local', 'mobile', 'toll_free'])
  type?: 'local' | 'mobile' | 'toll_free';
}

// ============================================
// Register Sender ID
// ============================================

export class RegisterSenderIdDto {
  @ApiProperty({
    description: 'Sender ID (alphanumeric, 3-11 characters)',
    example: 'MYCOMPANY',
    minLength: 3,
    maxLength: 11,
  })
  @IsString()
  @Length(3, 11)
  @Matches(/^[a-zA-Z0-9]+$/, { message: 'Sender ID must be alphanumeric' })
  senderId: string;

  @ApiProperty({
    description: 'Countries where this sender ID will be used (ISO 3166-1 alpha-2)',
    example: ['US', 'CA', 'GB'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  countries: string[];

  @ApiPropertyOptional({ description: 'Friendly name', example: 'Main Brand ID' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  friendlyName?: string;
}

// ============================================
// Update Sender
// ============================================

export class UpdateSenderDto {
  @ApiPropertyOptional({ description: 'Friendly name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  friendlyName?: string;

  @ApiPropertyOptional({ description: 'Set as default sender' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

// ============================================
// Admin: Update Sender ID Status
// ============================================

export class AdminUpdateSenderStatusDto {
  @ApiProperty({
    description: 'New status for the sender ID',
    enum: ['active', 'suspended', 'failed'],
  })
  @IsEnum(['active', 'suspended', 'failed'])
  status: 'active' | 'suspended' | 'failed';

  @ApiPropertyOptional({ description: 'Admin notes' })
  @IsOptional()
  @IsString()
  adminNotes?: string;

  @ApiPropertyOptional({ description: 'Rejection reason (required if status is failed)' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

// ============================================
// List Senders Query
// ============================================

export class ListSendersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by sender type', enum: SmsSenderType })
  @IsOptional()
  @IsEnum(SmsSenderType)
  type?: SmsSenderType;

  @ApiPropertyOptional({ description: 'Filter by status', enum: SmsSenderStatus })
  @IsOptional()
  @IsEnum(SmsSenderStatus)
  status?: SmsSenderStatus;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ============================================
// Response DTOs
// ============================================

export class SmsSenderResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: SmsSenderType })
  type: SmsSenderType;

  @ApiPropertyOptional()
  phoneNumber?: string;

  @ApiPropertyOptional()
  senderId?: string;

  @ApiPropertyOptional()
  countryCode?: string;

  @ApiPropertyOptional()
  senderIdCountries?: string[];

  @ApiProperty()
  friendlyName: string;

  @ApiProperty({ enum: SmsSenderStatus })
  status: SmsSenderStatus;

  @ApiPropertyOptional()
  monthlyPrice?: number;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty()
  messagesSent: number;

  @ApiProperty()
  deliveryRate: number;

  @ApiPropertyOptional()
  lastUsedAt?: Date;

  @ApiProperty()
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };

  @ApiPropertyOptional()
  purchasedAt?: Date;

  @ApiPropertyOptional()
  renews_at?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PlanLimitsResponseDto {
  @ApiProperty({ description: 'Maximum dedicated numbers allowed' })
  maxDedicatedNumbers: number;

  @ApiProperty({ description: 'Maximum toll-free numbers allowed' })
  maxTollFreeNumbers: number;

  @ApiProperty({ description: 'Whether sender IDs are allowed' })
  senderIdsAllowed: boolean;

  @ApiProperty({ description: 'Current dedicated number count' })
  currentDedicatedNumbers: number;

  @ApiProperty({ description: 'Current toll-free number count' })
  currentTollFreeNumbers: number;

  @ApiProperty({ description: 'Current sender ID count' })
  currentSenderIds: number;

  @ApiProperty({ description: 'Can purchase more dedicated numbers' })
  canPurchaseDedicated: boolean;

  @ApiProperty({ description: 'Can purchase more toll-free numbers' })
  canPurchaseTollFree: boolean;

  @ApiProperty({ description: 'Can register more sender IDs' })
  canRegisterSenderId: boolean;
}
