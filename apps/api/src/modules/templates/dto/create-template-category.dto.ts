import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, MaxLength, Min, Matches } from 'class-validator';

export class CreateTemplateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Marketing',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'Templates for marketing campaigns',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Category color (hex code)',
    example: '#6366f1',
    default: '#6366f1',
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid hex code (e.g., #6366f1)' })
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({
    description: 'Category icon name',
    example: 'folder',
    default: 'folder',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Sort order for display',
    example: 0,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
