import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentTenant } from '@/common/decorators';
import { TemplatesService } from './templates.service';
import { Template } from './entities/template.entity';
import { TemplateCategory } from './entities/template-category.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  FilterTemplatesDto,
  CreateTemplateCategoryDto,
  UpdateTemplateCategoryDto,
} from './dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Thumbnail upload directory
const THUMBNAIL_DIR = './uploads/thumbnails';

@ApiTags('Templates')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {
    // Ensure thumbnail directory exists
    if (!fs.existsSync(THUMBNAIL_DIR)) {
      fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
    }
  }

  // ==================== CATEGORIES (must be before :id routes) ====================

  @Post('categories')
  @ApiOperation({ summary: 'Create a new template category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  async createCategory(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateTemplateCategoryDto
  ): Promise<TemplateCategory> {
    return this.templatesService.createCategory(tenantId, dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all template categories' })
  @ApiResponse({ status: 200, description: 'Returns all categories' })
  async findAllCategories(@CurrentTenant() tenantId: string): Promise<TemplateCategory[]> {
    return this.templatesService.findAllCategories(tenantId);
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns the category' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategoryById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<TemplateCategory> {
    return this.templatesService.findCategoryById(tenantId, id);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update a category' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  async updateCategory(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateCategoryDto
  ): Promise<TemplateCategory> {
    return this.templatesService.updateCategory(tenantId, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Category deleted successfully' })
  @ApiResponse({ status: 400, description: 'Category has templates' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async removeCategory(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.templatesService.removeCategory(tenantId, id);
  }

  // ==================== TEMPLATES ====================

  @Post()
  @ApiOperation({ summary: 'Create a new template' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateTemplateDto
  ): Promise<Template> {
    return this.templatesService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all templates with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Returns paginated templates' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: FilterTemplatesDto
  ): Promise<PaginatedResponseDto<Template>> {
    return this.templatesService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get template statistics' })
  @ApiResponse({ status: 200, description: 'Returns template stats by type and status' })
  async getStats(@CurrentTenant() tenantId: string) {
    return this.templatesService.getTemplateStats(tenantId);
  }

  @Post('upload-thumbnail')
  @ApiOperation({ summary: 'Upload template thumbnail image' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          description: 'Base64 encoded PNG image (data URL format)',
        },
        templateId: {
          type: 'string',
          format: 'uuid',
          description: 'Template ID to associate thumbnail with',
        },
      },
      required: ['image', 'templateId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Thumbnail uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid image data' })
  async uploadThumbnail(
    @CurrentTenant() tenantId: string,
    @Body() body: { image: string; templateId: string }
  ): Promise<{ thumbnailUrl: string }> {
    const { image, templateId } = body;

    // Validate image data
    if (!image || !image.startsWith('data:image/')) {
      throw new BadRequestException('Invalid image data. Expected base64 data URL.');
    }

    // Extract base64 data
    const matches = image.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!matches) {
      throw new BadRequestException('Invalid image format. Only PNG and JPEG are supported.');
    }

    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const filename = `${templateId}-${uuidv4()}.${extension}`;
    const filePath = path.join(THUMBNAIL_DIR, filename);

    // Save file
    fs.writeFileSync(filePath, buffer);

    // Return URL path (relative to API)
    const thumbnailUrl = `/uploads/thumbnails/${filename}`;

    // Update template with thumbnail URL
    await this.templatesService.update(tenantId, templateId, { thumbnailUrl });

    return { thumbnailUrl };
  }

  // NOTE: :id routes must come AFTER all specific routes like /stats, /categories
  @Get(':id')
  @ApiOperation({ summary: 'Get a template by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns the template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Template> {
    return this.templatesService.findOne(tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a template' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto
  ): Promise<Template> {
    return this.templatesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Template deleted successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.templatesService.remove(tenantId, id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a template' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'New template name (optional)' },
      },
    },
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Template duplicated successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async duplicate(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string }
  ): Promise<Template> {
    return this.templatesService.duplicate(tenantId, id, body?.name);
  }

  @Post(':id/preview')
  @ApiOperation({ summary: 'Preview template with sample data' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: {
        first_name: 'John',
        company_name: 'Acme Inc',
        email: 'john@example.com',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Returns previewed template content' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async preview(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() sampleData: Record<string, string>
  ) {
    return this.templatesService.preview(tenantId, id, sampleData);
  }
}
