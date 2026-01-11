import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Template, TemplateType, TemplateStatus } from './entities/template.entity';
import { TemplateCategory } from './entities/template-category.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  FilterTemplatesDto,
  CreateTemplateCategoryDto,
  UpdateTemplateCategoryDto,
} from './dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(TemplateCategory)
    private readonly categoryRepository: Repository<TemplateCategory>
  ) {}

  // ==================== TEMPLATES ====================

  async create(tenantId: string, dto: CreateTemplateDto): Promise<Template> {
    // Validate category belongs to tenant
    if (dto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId, tenantId },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }

    // Extract variables from content
    const variables = this.extractVariables(dto.content, dto.subject);

    const template = this.templateRepository.create({
      ...dto,
      tenantId,
      variables,
      status: dto.status || TemplateStatus.DRAFT,
      isActive: dto.isActive ?? true,
      metadata: dto.metadata || {},
    });

    return this.templateRepository.save(template);
  }

  async findAll(
    tenantId: string,
    query: FilterTemplatesDto
  ): Promise<PaginatedResponseDto<Template>> {
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.category', 'category')
      .where('template.tenant_id = :tenantId', { tenantId })
      .andWhere('template.deleted_at IS NULL');

    // Apply filters
    if (query.type) {
      queryBuilder.andWhere('template.type = :type', { type: query.type });
    }

    if (query.categoryId) {
      queryBuilder.andWhere('template.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    if (query.status) {
      queryBuilder.andWhere('template.status = :status', { status: query.status });
    }

    if (query.isActive !== undefined) {
      queryBuilder.andWhere('template.is_active = :isActive', { isActive: query.isActive });
    }

    if (query.search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(template.name) LIKE LOWER(:search)', {
            search: `%${query.search}%`,
          }).orWhere('LOWER(template.subject) LIKE LOWER(:search)', {
            search: `%${query.search}%`,
          });
        })
      );
    }

    // Sorting
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'DESC';
    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'type'];

    if (allowedSortFields.includes(sortField)) {
      queryBuilder.orderBy(`template.${sortField}`, sortOrder);
    } else {
      queryBuilder.orderBy('template.createdAt', 'DESC');
    }

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(tenantId: string, id: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
      relations: ['category'],
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  async update(tenantId: string, id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(tenantId, id);

    // Validate category if changing
    if (dto.categoryId && dto.categoryId !== template.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId, tenantId },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }

    // Re-extract variables if content changed
    let variables = template.variables;
    if (dto.content !== undefined || dto.subject !== undefined) {
      variables = this.extractVariables(
        dto.content ?? template.content,
        dto.subject ?? template.subject
      );
    }

    Object.assign(template, dto, { variables });
    return this.templateRepository.save(template);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const template = await this.findOne(tenantId, id);
    await this.templateRepository.softRemove(template);
  }

  async duplicate(tenantId: string, id: string, newName?: string): Promise<Template> {
    const original = await this.findOne(tenantId, id);

    const duplicate = this.templateRepository.create({
      ...original,
      id: undefined,
      name: newName || `${original.name} (Copy)`,
      status: TemplateStatus.DRAFT,
      createdAt: undefined,
      updatedAt: undefined,
      deletedAt: undefined,
    });

    return this.templateRepository.save(duplicate);
  }

  async preview(
    tenantId: string,
    id: string,
    sampleData: Record<string, string>
  ): Promise<{ subject: string | null; content: string | null; plainText: string | null }> {
    const template = await this.findOne(tenantId, id);

    const replaceVariables = (text: string | null): string | null => {
      if (!text) return null;
      return text.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
        return sampleData[variable] || match;
      });
    };

    return {
      subject: replaceVariables(template.subject),
      content: replaceVariables(template.content),
      plainText: replaceVariables(template.plainText),
    };
  }

  // ==================== CATEGORIES ====================

  async createCategory(
    tenantId: string,
    dto: CreateTemplateCategoryDto
  ): Promise<TemplateCategory> {
    // Check for duplicate name
    const existing = await this.categoryRepository.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    const category = this.categoryRepository.create({
      ...dto,
      tenantId,
    });

    return this.categoryRepository.save(category);
  }

  async findAllCategories(tenantId: string): Promise<TemplateCategory[]> {
    return this.categoryRepository.find({
      where: { tenantId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findCategoryById(tenantId: string, id: string): Promise<TemplateCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: UpdateTemplateCategoryDto
  ): Promise<TemplateCategory> {
    const category = await this.findCategoryById(tenantId, id);

    // Check for duplicate name if changing
    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoryRepository.findOne({
        where: { tenantId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException('A category with this name already exists');
      }
    }

    Object.assign(category, dto);
    return this.categoryRepository.save(category);
  }

  async removeCategory(tenantId: string, id: string): Promise<void> {
    const category = await this.findCategoryById(tenantId, id);

    // Check if category has templates
    const templateCount = await this.templateRepository.count({
      where: { tenantId, categoryId: id },
    });

    if (templateCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${templateCount} template(s). Move or delete templates first.`
      );
    }

    await this.categoryRepository.remove(category);
  }

  // ==================== HELPERS ====================

  private extractVariables(content?: string | null, subject?: string | null): string[] {
    const variables = new Set<string>();
    const regex = /\{\{(\w+)\}\}/g;

    const extractFromText = (text: string | null | undefined) => {
      if (!text) return;
      let match;
      while ((match = regex.exec(text)) !== null) {
        variables.add(match[1]);
      }
    };

    extractFromText(content);
    extractFromText(subject);

    return Array.from(variables);
  }

  async getTemplateStats(tenantId: string): Promise<{
    total: number;
    byType: Record<TemplateType, number>;
    byStatus: Record<TemplateStatus, number>;
  }> {
    const templates = await this.templateRepository.find({
      where: { tenantId },
      select: ['type', 'status'],
    });

    const byType = {
      [TemplateType.EMAIL]: 0,
      [TemplateType.SMS]: 0,
      [TemplateType.WHATSAPP]: 0,
    };

    const byStatus = {
      [TemplateStatus.DRAFT]: 0,
      [TemplateStatus.ACTIVE]: 0,
      [TemplateStatus.ARCHIVED]: 0,
    };

    templates.forEach((t) => {
      byType[t.type]++;
      byStatus[t.status]++;
    });

    return {
      total: templates.length,
      byType,
      byStatus,
    };
  }
}
