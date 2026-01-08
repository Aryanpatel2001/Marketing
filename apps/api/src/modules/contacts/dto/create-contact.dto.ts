import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ContactSource, ContactStatus } from '../entities/contact.entity';

export class CreateContactDto {
  @ApiPropertyOptional({
    description: 'Contact email address',
    example: 'john@example.com',
  })
  @ValidateIf((o) => !o.phone && !o.whatsappNumber)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+1234567890',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp number',
    example: '+1234567890',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  whatsappNumber?: string;

  @ApiPropertyOptional({
    description: 'First name',
    example: 'John',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    example: 'Doe',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Company name',
    example: 'Acme Inc',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({
    description: 'Job title',
    example: 'Marketing Manager',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Website URL',
    example: 'https://example.com',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'New York',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({
    description: 'State/Province',
    example: 'NY',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'USA',
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({
    description: 'Postal/ZIP code',
    example: '10001',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Custom fields as key-value pairs',
    example: { industry: 'Technology', company_size: '50-100' },
  })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Tags for categorization',
    example: ['vip', 'newsletter'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Contact source',
    enum: ContactSource,
    default: ContactSource.MANUAL,
  })
  @IsEnum(ContactSource)
  @IsOptional()
  source?: ContactSource;

  @ApiPropertyOptional({
    description: 'Contact status',
    enum: ContactStatus,
    default: ContactStatus.ACTIVE,
  })
  @IsEnum(ContactStatus)
  @IsOptional()
  status?: ContactStatus;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Met at conference 2025',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'List IDs to add contact to',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  listIds?: string[];
}
