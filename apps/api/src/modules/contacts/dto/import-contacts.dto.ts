import { IsArray, IsEnum, IsBoolean, IsOptional, ValidateNested, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ImportContactDataDto {
  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'WhatsApp number' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Job title' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State/Province' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['active', 'unsubscribed'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export enum DuplicateHandling {
  SKIP = 'skip',
  UPDATE = 'update',
  CREATE_NEW = 'create_new',
}

export enum DuplicateCheckField {
  EMAIL = 'email',
  PHONE = 'phone',
  BOTH = 'both',
}

export class ImportContactsDto {
  @ApiProperty({
    description: 'Array of contact data to import',
    type: [ImportContactDataDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportContactDataDto)
  contacts: ImportContactDataDto[];

  @ApiProperty({
    description: 'How to handle duplicate contacts',
    enum: DuplicateHandling,
    default: DuplicateHandling.SKIP,
  })
  @IsEnum(DuplicateHandling)
  duplicateHandling: DuplicateHandling;

  @ApiProperty({
    description: 'Field to check for duplicates',
    enum: DuplicateCheckField,
    default: DuplicateCheckField.EMAIL,
  })
  @IsEnum(DuplicateCheckField)
  duplicateCheckField: DuplicateCheckField;

  @ApiPropertyOptional({
    description: 'Whether to replace existing tags when updating',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  updateExistingTags?: boolean;
}

export class ImportResultDto {
  @ApiProperty({ description: 'Number of contacts created' })
  created: number;

  @ApiProperty({ description: 'Number of contacts updated' })
  updated: number;

  @ApiProperty({ description: 'Number of contacts skipped' })
  skipped: number;

  @ApiPropertyOptional({
    description: 'Array of errors encountered',
    type: 'array',
  })
  errors?: Array<{ index: number; message: string }>;
}
