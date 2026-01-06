// ============================================
// User Roles
// ============================================

export const USER_ROLES = ['owner', 'admin', 'manager', 'member'] as const;

export const ROLE_PERMISSIONS = {
  owner: {
    canManageTeam: true,
    canManageBilling: true,
    canManageSettings: true,
    canManageCampaigns: true,
    canManageContacts: true,
    canManageTemplates: true,
    canViewAnalytics: true,
    canManageApiKeys: true,
    canDeleteOrganization: true,
  },
  admin: {
    canManageTeam: true,
    canManageBilling: true,
    canManageSettings: true,
    canManageCampaigns: true,
    canManageContacts: true,
    canManageTemplates: true,
    canViewAnalytics: true,
    canManageApiKeys: true,
    canDeleteOrganization: false,
  },
  manager: {
    canManageTeam: false,
    canManageBilling: false,
    canManageSettings: false,
    canManageCampaigns: true,
    canManageContacts: true,
    canManageTemplates: true,
    canViewAnalytics: true,
    canManageApiKeys: false,
    canDeleteOrganization: false,
  },
  member: {
    canManageTeam: false,
    canManageBilling: false,
    canManageSettings: false,
    canManageCampaigns: true,
    canManageContacts: true,
    canManageTemplates: false,
    canViewAnalytics: true,
    canManageApiKeys: false,
    canDeleteOrganization: false,
  },
} as const;

// ============================================
// Plan Limits
// ============================================

export const PLANS = {
  free: {
    name: 'Free',
    slug: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      maxContacts: 500,
      maxEmailsPerMonth: 1000,
      maxSmsPerMonth: 0,
      maxWhatsappPerMonth: 0,
      maxTeamMembers: 1,
      maxAutomations: 0,
    },
    features: {
      emailMarketing: true,
      smsMarketing: false,
      whatsappMarketing: false,
      automations: false,
      abTesting: false,
      customDomain: false,
      apiAccess: false,
      dedicatedIp: false,
      prioritySupport: false,
    },
  },
  starter: {
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 29,
    priceYearly: 290,
    limits: {
      maxContacts: 2500,
      maxEmailsPerMonth: 25000,
      maxSmsPerMonth: 500,
      maxWhatsappPerMonth: 500,
      maxTeamMembers: 3,
      maxAutomations: 5,
    },
    features: {
      emailMarketing: true,
      smsMarketing: true,
      whatsappMarketing: true,
      automations: true,
      abTesting: true,
      customDomain: false,
      apiAccess: true,
      dedicatedIp: false,
      prioritySupport: false,
    },
  },
  growth: {
    name: 'Growth',
    slug: 'growth',
    priceMonthly: 79,
    priceYearly: 790,
    limits: {
      maxContacts: 10000,
      maxEmailsPerMonth: 100000,
      maxSmsPerMonth: 2000,
      maxWhatsappPerMonth: 2000,
      maxTeamMembers: 10,
      maxAutomations: 20,
    },
    features: {
      emailMarketing: true,
      smsMarketing: true,
      whatsappMarketing: true,
      automations: true,
      abTesting: true,
      customDomain: true,
      apiAccess: true,
      dedicatedIp: false,
      prioritySupport: true,
    },
  },
  pro: {
    name: 'Pro',
    slug: 'pro',
    priceMonthly: 199,
    priceYearly: 1990,
    limits: {
      maxContacts: 50000,
      maxEmailsPerMonth: 500000,
      maxSmsPerMonth: 10000,
      maxWhatsappPerMonth: 10000,
      maxTeamMembers: 25,
      maxAutomations: 100,
    },
    features: {
      emailMarketing: true,
      smsMarketing: true,
      whatsappMarketing: true,
      automations: true,
      abTesting: true,
      customDomain: true,
      apiAccess: true,
      dedicatedIp: true,
      prioritySupport: true,
    },
  },
} as const;

// ============================================
// Campaign Status
// ============================================

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'] as const;

export const CAMPAIGN_STATUS_LABELS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
  cancelled: 'Cancelled',
} as const;

export const CAMPAIGN_STATUS_COLORS = {
  draft: 'gray',
  scheduled: 'blue',
  sending: 'yellow',
  sent: 'green',
  paused: 'orange',
  cancelled: 'red',
} as const;

// ============================================
// Contact Status
// ============================================

export const CONTACT_STATUSES = ['active', 'unsubscribed', 'bounced', 'complained'] as const;

export const CONTACT_STATUS_LABELS = {
  active: 'Active',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Complained',
} as const;

// ============================================
// RabbitMQ Queue Names
// ============================================

export const QUEUES = {
  // Job Queues (Direct Exchange)
  JOBS: {
    EMAIL_SEND: 'jobs.email.send',
    EMAIL_BULK: 'jobs.email.bulk',
    SMS_SEND: 'jobs.sms.send',
    SMS_BULK: 'jobs.sms.bulk',
    WHATSAPP_SEND: 'jobs.whatsapp.send',
    WHATSAPP_BULK: 'jobs.whatsapp.bulk',
    IMPORT_CONTACTS: 'jobs.import.contacts',
    EXPORT_CONTACTS: 'jobs.export.contacts',
    EXPORT_REPORT: 'jobs.export.report',
    WEBHOOK_DELIVER: 'jobs.webhook.deliver',
    CAMPAIGN_SCHEDULED: 'jobs.campaign.scheduled',
    AUTOMATION_STEP: 'jobs.automation.step',
  },

  // Event Topics (Topic Exchange)
  EVENTS: {
    CONTACT_CREATED: 'contact.created',
    CONTACT_UPDATED: 'contact.updated',
    CONTACT_DELETED: 'contact.deleted',
    CONTACT_UNSUBSCRIBED: 'contact.unsubscribed',
    CONTACT_IMPORTED: 'contact.imported',
    CAMPAIGN_CREATED: 'campaign.created',
    CAMPAIGN_STARTED: 'campaign.started',
    CAMPAIGN_COMPLETED: 'campaign.completed',
    CAMPAIGN_PAUSED: 'campaign.paused',
    EMAIL_SENT: 'email.sent',
    EMAIL_DELIVERED: 'email.delivered',
    EMAIL_OPENED: 'email.opened',
    EMAIL_CLICKED: 'email.clicked',
    EMAIL_BOUNCED: 'email.bounced',
    EMAIL_COMPLAINED: 'email.complained',
    SMS_SENT: 'sms.sent',
    SMS_DELIVERED: 'sms.delivered',
    SMS_FAILED: 'sms.failed',
    PAYMENT_RECEIVED: 'payment.received',
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_UPDATED: 'subscription.updated',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  },

  // Exchanges
  EXCHANGES: {
    JOBS: 'jobs',
    EVENTS: 'events',
    DLX: 'dlx',
    DELAYED: 'delayed',
  },
} as const;

// ============================================
// Validation
// ============================================

export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 100,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  PHONE_MAX_LENGTH: 50,
  COMPANY_MAX_LENGTH: 255,
  CAMPAIGN_NAME_MAX_LENGTH: 255,
  SUBJECT_MAX_LENGTH: 500,
  PREVIEW_TEXT_MAX_LENGTH: 255,
  SMS_MAX_LENGTH: 1600,
  TAG_MAX_LENGTH: 50,
  MAX_TAGS_PER_CONTACT: 50,
  MAX_CUSTOM_FIELDS: 50,
} as const;

// ============================================
// Pagination
// ============================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ============================================
// API Rate Limits
// ============================================

export const RATE_LIMITS = {
  LOGIN: { points: 5, duration: 60 }, // 5 attempts per minute
  REGISTER: { points: 3, duration: 60 }, // 3 attempts per minute
  PASSWORD_RESET: { points: 3, duration: 3600 }, // 3 attempts per hour
  API_KEY: { points: 1000, duration: 3600 }, // 1000 requests per hour
  WEBHOOK: { points: 100, duration: 60 }, // 100 requests per minute
} as const;

// ============================================
// File Upload
// ============================================

export const FILE_UPLOAD = {
  MAX_SIZE_MB: 10,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
  MAX_CONTACTS_IMPORT: 100000,
} as const;

// ============================================
// SMS Character Limits
// ============================================

export const SMS_LIMITS = {
  GSM_7_SINGLE: 160,
  GSM_7_MULTI: 153,
  UNICODE_SINGLE: 70,
  UNICODE_MULTI: 67,
  MAX_PARTS: 10,
} as const;
