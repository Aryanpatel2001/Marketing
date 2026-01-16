import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { StripeService } from './stripe.service';
import { InvoiceDto } from '../dto/subscription.dto';

export interface InvoiceFilters {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly tenantsService: TenantsService,
    private readonly stripeService: StripeService
  ) {}

  async getInvoices(
    tenantId: string,
    filters: InvoiceFilters = {}
  ): Promise<{ data: InvoiceDto[]; total: number; page: number; limit: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const whereClause: any = { tenantId };

    if (filters.startDate && filters.endDate) {
      whereClause.createdAt = Between(new Date(filters.startDate), new Date(filters.endDate));
    } else if (filters.startDate) {
      whereClause.createdAt = MoreThanOrEqual(new Date(filters.startDate));
    } else if (filters.endDate) {
      whereClause.createdAt = LessThanOrEqual(new Date(filters.endDate));
    }

    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: invoices.map(this.mapToDto),
      total,
      page,
      limit,
    };
  }

  async getInvoiceById(tenantId: string, invoiceId: string): Promise<InvoiceDto> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.mapToDto(invoice);
  }

  async syncInvoicesFromStripe(tenantId: string): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    if (!tenant || !tenant.stripeCustomerId) {
      return;
    }

    this.logger.log(`Syncing invoices from Stripe for tenant ${tenantId}`);

    const stripeInvoices = await this.stripeService.listInvoices(tenant.stripeCustomerId, 100);

    for (const stripeInvoice of stripeInvoices) {
      await this.upsertInvoice(stripeInvoice, tenantId);
    }
  }

  private async upsertInvoice(stripeInvoice: any, tenantId: string): Promise<Invoice> {
    let invoice = await this.invoiceRepository.findOne({
      where: { stripeInvoiceId: stripeInvoice.id },
    });

    const invoiceData = {
      tenantId,
      stripeInvoiceId: stripeInvoice.id,
      stripeCustomerId: stripeInvoice.customer,
      stripeSubscriptionId: stripeInvoice.subscription,
      status: stripeInvoice.status,
      amount: stripeInvoice.total / 100,
      amountPaid: stripeInvoice.amount_paid / 100,
      currency: stripeInvoice.currency.toUpperCase(),
      invoiceNumber: stripeInvoice.number,
      invoiceUrl: stripeInvoice.hosted_invoice_url,
      pdfUrl: stripeInvoice.invoice_pdf,
      dueDate: stripeInvoice.due_date ? new Date(stripeInvoice.due_date * 1000) : null,
      paidAt: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : null,
      periodStart: stripeInvoice.period_start ? new Date(stripeInvoice.period_start * 1000) : null,
      periodEnd: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
    };

    if (invoice) {
      Object.assign(invoice, invoiceData);
    } else {
      invoice = this.invoiceRepository.create(invoiceData);
    }

    return this.invoiceRepository.save(invoice);
  }

  private mapToDto(invoice: Invoice): InvoiceDto {
    return {
      id: invoice.id,
      stripeInvoiceId: invoice.stripeInvoiceId,
      status: invoice.status,
      amount: Number(invoice.amount),
      amountPaid: Number(invoice.amountPaid),
      currency: invoice.currency,
      invoiceNumber: invoice.invoiceNumber || undefined,
      invoiceUrl: invoice.invoiceUrl || undefined,
      pdfUrl: invoice.pdfUrl || undefined,
      dueDate: invoice.dueDate || undefined,
      paidAt: invoice.paidAt || undefined,
      createdAt: invoice.createdAt,
    };
  }
}
