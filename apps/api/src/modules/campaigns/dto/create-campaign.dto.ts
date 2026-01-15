import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
  IsBoolean,
  IsArray,
  IsDateString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CampaignType,
  AudienceType,
  EmailContent,
  SmsContent,
  WhatsAppContent,
} from '../entities/campaign.entity';

export class EmailContentDto implements EmailContent {
  @ApiProperty({ description: 'Email subject line', example: 'Welcome to {{company_name}}!' })
  @IsString()
  @MaxLength(255)
  subject: string;

  @ApiPropertyOptional({
    description: 'Preview text shown in inbox',
    example: 'Check out what we have for you...',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  previewText?: string;

  @ApiProperty({ description: 'Sender name', example: 'John from Acme' })
  @IsString()
  @MaxLength(100)
  fromName: string;

  @ApiProperty({ description: 'Sender email', example: 'john@acme.com' })
  @IsString()
  @MaxLength(255)
  fromEmail: string;

  @ApiPropertyOptional({ description: 'Reply-to email', example: 'support@acme.com' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  replyTo?: string;

  @ApiProperty({ description: 'HTML content of the email' })
  @IsString()
  htmlContent: string;

  @ApiPropertyOptional({ description: 'Unlayer design JSON' })
  @IsObject()
  @IsOptional()
  designJson?: Record<string, unknown>;
}

export class SmsContentDto implements SmsContent {
  @ApiProperty({
    description: 'SMS message text',
    example: 'Hi {{first_name}}, your code is {{code}}',
  })
  @IsString()
  @MaxLength(1600)
  message: string;

  @ApiPropertyOptional({ description: 'Sender ID', example: 'ACME' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  senderId?: string;
}

export class WhatsAppButtonDto {
  @ApiProperty({ enum: ['QUICK_REPLY', 'URL', 'PHONE'] })
  @IsString()
  type: 'QUICK_REPLY' | 'URL' | 'PHONE';

  @ApiProperty({ example: 'Shop Now' })
  @IsString()
  @MaxLength(25)
  text: string;

  @ApiPropertyOptional({ example: 'https://example.com/shop' })
  @IsString()
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class WhatsAppHeaderDto {
  @ApiProperty({ enum: ['text', 'image', 'video', 'document'] })
  @IsString()
  type: 'text' | 'image' | 'video' | 'document';

  @ApiProperty({ example: 'Welcome!' })
  @IsString()
  content: string;
}

export class WhatsAppContentDto implements WhatsAppContent {
  @ApiProperty({ description: 'Meta template name', example: 'welcome_message' })
  @IsString()
  @MaxLength(100)
  templateName: string;

  @ApiProperty({ description: 'Meta template ID' })
  @IsString()
  templateId: string;

  @ApiProperty({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  @IsString()
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @ApiProperty({ example: 'en' })
  @IsString()
  @MaxLength(10)
  language: string;

  @ApiPropertyOptional()
  @ValidateNested()
  @Type(() => WhatsAppHeaderDto)
  @IsOptional()
  header?: WhatsAppHeaderDto;

  @ApiProperty({ description: 'Message body with {{1}} {{2}} placeholders' })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Body parameter values',
    example: ['first_name', 'discount_code'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bodyParameters?: string[];

  @ApiPropertyOptional({ example: 'Reply STOP to unsubscribe' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  footer?: string;

  @ApiPropertyOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsAppButtonDto)
  @IsOptional()
  buttons?: WhatsAppButtonDto[];
}

export class CreateCampaignDto {
  @ApiProperty({
    description: 'Campaign name',
    example: 'January Newsletter',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Campaign description',
    example: 'Monthly newsletter for January 2026',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Campaign type',
    enum: CampaignType,
    example: CampaignType.EMAIL,
  })
  @IsEnum(CampaignType)
  type: CampaignType;

  @ApiPropertyOptional({
    description: 'Template ID to use',
  })
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({
    description: 'Campaign content (structure depends on type)',
  })
  @IsObject()
  @IsOptional()
  content?: EmailContentDto | SmsContentDto | WhatsAppContentDto;

  @ApiPropertyOptional({
    description: 'Audience type',
    enum: AudienceType,
    default: AudienceType.LIST,
  })
  @IsEnum(AudienceType)
  @IsOptional()
  audienceType?: AudienceType;

  @ApiPropertyOptional({
    description: 'Contact list IDs to send to',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  contactListIds?: string[];

  @ApiPropertyOptional({
    description: 'Segment criteria (for dynamic segments)',
  })
  @IsObject()
  @IsOptional()
  segmentCriteria?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Send immediately or schedule',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  sendImmediately?: boolean;

  @ApiPropertyOptional({
    description: 'Scheduled send time (ISO 8601)',
    example: '2026-01-15T10:00:00Z',
  })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Timezone for scheduling',
    default: 'UTC',
    example: 'America/New_York',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  timezone?: string;
}
