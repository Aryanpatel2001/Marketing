import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { TemplateType, TemplateStatus } from '../entities/template.entity';

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Template name',
    example: 'Welcome Email',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Template type',
    enum: TemplateType,
    example: TemplateType.EMAIL,
  })
  @IsEnum(TemplateType)
  type: TemplateType;

  @ApiPropertyOptional({
    description: 'Category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Email subject line (for email templates)',
    example: 'Welcome to {{company_name}}!',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Template content (HTML for email, text for SMS/WhatsApp)',
    example: '<h1>Welcome!</h1><p>Hello {{first_name}}</p>',
  })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    description: 'Unlayer design JSON (for email templates)',
  })
  @IsObject()
  @IsOptional()
  designJson?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Plain text version of the template',
  })
  @IsString()
  @IsOptional()
  plainText?: string;

  @ApiPropertyOptional({
    description: 'Template status',
    enum: TemplateStatus,
    default: TemplateStatus.DRAFT,
  })
  @IsEnum(TemplateStatus)
  @IsOptional()
  status?: TemplateStatus;

  @ApiPropertyOptional({
    description: 'Whether template is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Template metadata',
    example: { preheader: 'Check out our latest features' },
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
