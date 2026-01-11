import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Res,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { Contact } from './entities/contact.entity';
import { ContactList } from './entities/contact-list.entity';
import {
  CreateContactDto,
  UpdateContactDto,
  FilterContactsDto,
  CreateContactListDto,
  UpdateContactListDto,
  BulkDeleteContactsDto,
  BulkUpdateContactsDto,
  AddContactsToListDto,
  RemoveContactsFromListDto,
  ImportContactsDto,
  ImportResultDto,
} from './dto';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser, CurrentTenant } from '@/common/decorators';

@ApiTags('Contacts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // ==================== STATIC ROUTES (must come before parameterized routes) ====================

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiResponse({ status: 201, description: 'Contact created successfully' })
  @ApiResponse({ status: 409, description: 'Contact with this email already exists' })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateContactDto): Promise<Contact> {
    return this.contactsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all contacts with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Returns paginated contacts list' })
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: FilterContactsDto
  ): Promise<PaginatedResponseDto<Contact>> {
    return this.contactsService.findAll(tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contact statistics' })
  @ApiResponse({ status: 200, description: 'Returns contact statistics' })
  async getStats(@CurrentTenant() tenantId: string) {
    return this.contactsService.getStats(tenantId);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="contacts.csv"')
  @ApiOperation({ summary: 'Export contacts as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportContacts(
    @CurrentTenant() tenantId: string,
    @Query() query: FilterContactsDto,
    @Res({ passthrough: true }) _res: Response
  ): Promise<StreamableFile> {
    const contacts = await this.contactsService.exportContacts(tenantId, query);

    // Generate CSV content
    const headers = [
      'Email',
      'Phone',
      'WhatsApp',
      'First Name',
      'Last Name',
      'Company',
      'Job Title',
      'Website',
      'City',
      'State',
      'Country',
      'Postal Code',
      'Tags',
      'Status',
      'Source',
      'Notes',
      'Created At',
    ];

    const rows = contacts.map((contact) => [
      contact.email || '',
      contact.phone || '',
      contact.whatsappNumber || '',
      contact.firstName || '',
      contact.lastName || '',
      contact.company || '',
      contact.jobTitle || '',
      contact.website || '',
      contact.city || '',
      contact.state || '',
      contact.country || '',
      contact.postalCode || '',
      (contact.tags || []).join(';'),
      contact.status || '',
      contact.source || '',
      (contact.notes || '').replace(/"/g, '""'), // Escape double quotes
      contact.createdAt ? new Date(contact.createdAt).toISOString() : '',
    ]);

    // Escape and format CSV
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [headers.join(','), ...rows.map((row) => row.map(escapeCSV).join(','))].join(
      '\n'
    );

    const buffer = Buffer.from(csvContent, 'utf-8');
    return new StreamableFile(buffer);
  }

  // ==================== BULK OPERATIONS ====================

  @Post('bulk/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete contacts' })
  @ApiResponse({ status: 200, description: 'Contacts deleted successfully' })
  async bulkDelete(
    @CurrentTenant() tenantId: string,
    @Body() dto: BulkDeleteContactsDto
  ): Promise<{ deleted: number }> {
    return this.contactsService.bulkDelete(tenantId, dto);
  }

  @Post('bulk/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk update contacts (tags, status)' })
  @ApiResponse({ status: 200, description: 'Contacts updated successfully' })
  async bulkUpdate(
    @CurrentTenant() tenantId: string,
    @Body() dto: BulkUpdateContactsDto
  ): Promise<{ updated: number }> {
    return this.contactsService.bulkUpdate(tenantId, dto);
  }

  // ==================== IMPORT/EXPORT ====================

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import contacts from CSV data' })
  @ApiResponse({ status: 200, description: 'Import completed', type: ImportResultDto })
  async importContacts(
    @CurrentTenant() tenantId: string,
    @Body() dto: ImportContactsDto
  ): Promise<ImportResultDto> {
    return this.contactsService.importContacts(tenantId, dto);
  }

  @Get('imports/history')
  @ApiOperation({ summary: 'Get import job history' })
  @ApiResponse({ status: 200, description: 'Returns import job history' })
  async getImportHistory(
    @CurrentTenant() tenantId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.contactsService.getImportJobs(tenantId, { limit, offset });
  }

  @Get('imports/:jobId')
  @ApiOperation({ summary: 'Get import job details' })
  @ApiParam({ name: 'jobId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns import job details' })
  async getImportJob(
    @CurrentTenant() tenantId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string
  ) {
    return this.contactsService.getImportJob(tenantId, jobId);
  }

  // ==================== TAG MANAGEMENT ====================

  @Get('tags/all')
  @ApiOperation({ summary: 'Get all tags with counts' })
  @ApiResponse({ status: 200, description: 'Returns all tags with usage counts' })
  async getAllTags(@CurrentTenant() tenantId: string) {
    return this.contactsService.getAllTags(tenantId);
  }

  @Post('tags/rename')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a tag across all contacts' })
  @ApiResponse({ status: 200, description: 'Tag renamed successfully' })
  async renameTag(
    @CurrentTenant() tenantId: string,
    @Body('oldTag') oldTag: string,
    @Body('newTag') newTag: string
  ) {
    return this.contactsService.renameTag(tenantId, oldTag, newTag);
  }

  @Delete('tags/:tag')
  @ApiOperation({ summary: 'Delete a tag from all contacts' })
  @ApiResponse({ status: 200, description: 'Tag deleted successfully' })
  async deleteTag(@CurrentTenant() tenantId: string, @Param('tag') tag: string) {
    return this.contactsService.deleteTag(tenantId, tag);
  }

  // ==================== CONTACT LISTS (must come before :id routes) ====================

  @Post('lists')
  @ApiOperation({ summary: 'Create a new contact list' })
  @ApiResponse({ status: 201, description: 'List created successfully' })
  async createList(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateContactListDto
  ): Promise<ContactList> {
    return this.contactsService.createList(tenantId, userId, dto);
  }

  @Get('lists')
  @ApiOperation({ summary: 'Get all contact lists' })
  @ApiResponse({ status: 200, description: 'Returns all contact lists' })
  async findAllLists(@CurrentTenant() tenantId: string): Promise<ContactList[]> {
    return this.contactsService.findAllLists(tenantId);
  }

  @Get('lists/:listId')
  @ApiOperation({ summary: 'Get a contact list by ID' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns the contact list' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async findOneList(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string
  ): Promise<ContactList> {
    return this.contactsService.findOneList(tenantId, listId);
  }

  @Put('lists/:listId')
  @ApiOperation({ summary: 'Update a contact list' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List updated successfully' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async updateList(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateContactListDto
  ): Promise<ContactList> {
    return this.contactsService.updateList(tenantId, listId, dto);
  }

  @Delete('lists/:listId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact list' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'List deleted successfully' })
  @ApiResponse({ status: 404, description: 'List not found' })
  async removeList(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string
  ): Promise<void> {
    return this.contactsService.removeList(tenantId, listId);
  }

  @Get('lists/:listId/contacts')
  @ApiOperation({ summary: 'Get contacts in a list' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns contacts in the list' })
  async getListContacts(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Query() query: FilterContactsDto
  ): Promise<PaginatedResponseDto<Contact>> {
    return this.contactsService.getListContacts(tenantId, listId, query);
  }

  @Post('lists/:listId/contacts')
  @ApiOperation({ summary: 'Add contacts to a list' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contacts added to list' })
  async addContactsToList(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: AddContactsToListDto
  ): Promise<{ added: number }> {
    return this.contactsService.addContactsToList(tenantId, listId, dto);
  }

  @Delete('lists/:listId/contacts')
  @ApiOperation({ summary: 'Remove contacts from a list' })
  @ApiParam({ name: 'listId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contacts removed from list' })
  async removeContactsFromList(
    @CurrentTenant() tenantId: string,
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: RemoveContactsFromListDto
  ): Promise<{ removed: number }> {
    return this.contactsService.removeContactsFromList(tenantId, listId, dto.contactIds);
  }

  // ==================== CONTACT MERGE ====================

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge multiple contacts into one' })
  @ApiResponse({ status: 200, description: 'Contacts merged successfully' })
  async mergeContacts(
    @CurrentTenant() tenantId: string,
    @Body('primaryContactId', ParseUUIDPipe) primaryContactId: string,
    @Body('secondaryContactIds') secondaryContactIds: string[]
  ): Promise<Contact> {
    return this.contactsService.mergeContacts(tenantId, primaryContactId, secondaryContactIds);
  }

  // ==================== PARAMETERIZED ROUTES (must come last) ====================

  @Get(':id')
  @ApiOperation({ summary: 'Get a contact by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns the contact' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<Contact> {
    return this.contactsService.findOne(tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a contact' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Contact updated successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto
  ): Promise<Contact> {
    return this.contactsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Contact deleted successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    return this.contactsService.remove(tenantId, id);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add tags to a contact' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tags added successfully' })
  async addTags(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[]
  ): Promise<Contact> {
    return this.contactsService.addTags(tenantId, id, tags);
  }

  @Delete(':id/tags')
  @ApiOperation({ summary: 'Remove tags from a contact' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Tags removed successfully' })
  async removeTags(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[]
  ): Promise<Contact> {
    return this.contactsService.removeTags(tenantId, id, tags);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Get contact activity timeline' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Returns contact activities' })
  async getContactActivities(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    // Verify contact belongs to tenant
    await this.contactsService.findOne(tenantId, id);
    return this.contactsService.getContactActivities(id, { limit, offset });
  }
}
