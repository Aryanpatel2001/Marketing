import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {
  @ApiPropertyOptional({
    description: 'Thumbnail URL for the template preview',
    example: '/uploads/thumbnails/abc123.png',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  thumbnailUrl?: string;
}
