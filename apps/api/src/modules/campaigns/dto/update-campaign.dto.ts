import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';
import { CampaignStatus } from '../entities/campaign.entity';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
  @ApiPropertyOptional({
    description: 'Campaign status',
    enum: CampaignStatus,
  })
  @IsEnum(CampaignStatus)
  @IsOptional()
  status?: CampaignStatus;
}
