// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// User Types
// ============================================

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  avatarUrl: string | null;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'member';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// ============================================
// Tenant Types
// ============================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  planId: string | null;
  status: TenantStatus;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export type TenantStatus = 'active' | 'suspended' | 'cancelled';

export interface TenantSettings {
  timezone?: string;
  dateFormat?: string;
  defaultFromName?: string;
  defaultFromEmail?: string;
  defaultReplyTo?: string;
}

// ============================================
// Contact Types
// ============================================

export interface Contact {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  source: ContactSource;
  status: ContactStatus;
  emailStatus: ChannelStatus;
  smsStatus: ChannelStatus;
  whatsappStatus: ChannelStatus;
  engagementScore: number;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactSource = 'manual' | 'import' | 'api' | 'form';
export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained';
export type ChannelStatus = 'active' | 'unsubscribed' | 'bounced';

export interface CreateContactInput {
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  source?: ContactSource;
}

export interface UpdateContactInput {
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
}

export interface ContactList {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: 'static' | 'dynamic';
  filterCriteria: Record<string, unknown> | null;
  contactCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Campaign Types
// ============================================

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  subject: string | null;
  previewText: string | null;
  content: string | null;
  templateId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  contactListIds: string[];
  segmentCriteria: Record<string, unknown> | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  isAbTest: boolean;
  abTestConfig: AbTestConfig | null;
  stats: CampaignStats;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CampaignType = 'email' | 'sms' | 'whatsapp';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

export interface AbTestConfig {
  variants: AbTestVariant[];
  winnerCriteria: 'open_rate' | 'click_rate';
  testPercentage: number;
  testDurationHours: number;
}

export interface AbTestVariant {
  id: string;
  subject: string;
  previewText?: string;
  content?: string;
}

export interface CampaignStats {
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;
}

export interface CreateCampaignInput {
  name: string;
  type: CampaignType;
  subject?: string;
  previewText?: string;
  content?: string;
  templateId?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  contactListIds?: string[];
  segmentCriteria?: Record<string, unknown>;
}

// ============================================
// Template Types
// ============================================

export interface EmailTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  category: TemplateCategory;
  subject: string | null;
  htmlContent: string | null;
  jsonContent: Record<string, unknown> | null;
  thumbnailUrl: string | null;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateCategory =
  | 'newsletter'
  | 'promotional'
  | 'transactional'
  | 'welcome'
  | 'announcement';

// ============================================
// Billing Types
// ============================================

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number | null;
  priceYearly: number | null;
  limits: PlanLimits;
  features: PlanFeatures;
  isActive: boolean;
  sortOrder: number;
}

export interface PlanLimits {
  maxContacts: number;
  maxEmailsPerMonth: number;
  maxSmsPerMonth: number;
  maxWhatsappPerMonth: number;
  maxTeamMembers: number;
  maxAutomations: number;
}

export interface PlanFeatures {
  emailMarketing: boolean;
  smsMarketing: boolean;
  whatsappMarketing: boolean;
  automations: boolean;
  abTesting: boolean;
  customDomain: boolean;
  apiAccess: boolean;
  dedicatedIp: boolean;
  prioritySupport: boolean;
}

// ============================================
// Analytics Types
// ============================================

export interface DashboardStats {
  contacts: {
    total: number;
    growth: number;
    active: number;
  };
  campaigns: {
    total: number;
    sent: number;
    scheduled: number;
  };
  engagement: {
    emailOpenRate: number;
    emailClickRate: number;
    smsDeliveryRate: number;
  };
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'campaign_sent' | 'contact_added' | 'contact_imported' | 'subscription_changed';
  description: string;
  timestamp: Date;
}

// ============================================
// Auth Types
// ============================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  organizationName: string;
}
