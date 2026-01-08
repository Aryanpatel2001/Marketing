import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject, MaxLength, Matches } from 'class-validator';
import { ListType } from '../entities/contact-list.entity';

export class CreateContactListDto {
  @ApiProperty({
    description: 'List name',
    example: 'Newsletter Subscribers',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'List description',
    example: 'Contacts who subscribed to our newsletter',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'List type',
    enum: ListType,
    default: ListType.STATIC,
  })
  @IsEnum(ListType)
  @IsOptional()
  type?: ListType;

  @ApiPropertyOptional({
    description: 'Filter criteria for dynamic lists',
    example: { status: 'active', tags: ['newsletter'] },
  })
  @IsObject()
  @IsOptional()
  filterCriteria?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'List color (hex)',
    example: '#3B82F6',
  })
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex color' })
  @IsOptional()
  color?: string;
}
