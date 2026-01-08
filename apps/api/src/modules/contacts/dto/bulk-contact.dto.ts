import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ArrayMinSize } from 'class-validator';
import { ContactStatus } from '../entities/contact.entity';

export class BulkDeleteContactsDto {
  @ApiProperty({
    description: 'Array of contact IDs to delete',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  ids: string[];
}

export class BulkUpdateContactsDto {
  @ApiProperty({
    description: 'Array of contact IDs to update',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  ids: string[];

  @ApiPropertyOptional({
    description: 'Tags to add',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  addTags?: string[];

  @ApiPropertyOptional({
    description: 'Tags to remove',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  removeTags?: string[];

  @ApiPropertyOptional({
    description: 'Status to set',
    enum: ContactStatus,
  })
  @IsEnum(ContactStatus)
  @IsOptional()
  status?: ContactStatus;
}

export class AddContactsToListDto {
  @ApiProperty({
    description: 'Array of contact IDs to add',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  contactIds: string[];
}

export class RemoveContactsFromListDto {
  @ApiProperty({
    description: 'Array of contact IDs to remove',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  contactIds: string[];
}
