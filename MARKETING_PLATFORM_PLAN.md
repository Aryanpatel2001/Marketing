# MARKETING AUTOMATION PLATFORM - COMPLETE TECHNICAL PLAN
## Updated & Production-Ready Specification

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Database Design](#database-design)
5. [Service Providers](#service-providers)
6. [Feature Breakdown by Phase](#feature-breakdown-by-phase)
7. [API Design](#api-design)
8. [Security Implementation](#security-implementation)
9. [Infrastructure & DevOps](#infrastructure--devops)
10. [Cost Estimates](#cost-estimates)
11. [Team Structure](#team-structure)
12. [Risk Mitigation](#risk-mitigation)

---

## EXECUTIVE SUMMARY

### Project Overview
A multi-channel marketing automation platform enabling businesses to manage Email, SMS, and WhatsApp campaigns from a single dashboard with automation workflows, analytics, and integrations.

### Market Validation
- Global market projected to reach $349.74 billion by 2035
- Strong demand for unified multi-channel solutions
- SMB segment underserved by enterprise solutions

### Key Differentiators
1. Unified multi-channel (Email + SMS + WhatsApp) in one platform
2. Affordable pricing for SMBs
3. Visual automation builder
4. AI-powered content generation
5. Superior deliverability focus

---

## TECHNOLOGY STACK

### Backend
| Component | Technology | Justification |
|-----------|------------|---------------|
| Runtime | Node.js 20 LTS | Event-driven, handles concurrent connections |
| Framework | NestJS | Enterprise architecture, TypeScript, modular |
| Language | TypeScript | Type safety, better maintainability |
| API Style | REST + GraphQL (Phase 2) | REST for simplicity, GraphQL for complex queries |
| Validation | class-validator + class-transformer | Request validation |
| Documentation | Swagger/OpenAPI | Auto-generated API docs |

### Frontend
| Component | Technology | Justification |
|-----------|------------|---------------|
| Framework | Next.js 14 (App Router) | SSR, SEO, React ecosystem |
| Language | TypeScript | Consistency with backend |
| Styling | Tailwind CSS | Rapid development, consistent design |
| UI Components | shadcn/ui | Modern, accessible, customizable |
| State Management | Zustand | Simple, lightweight |
| Forms | React Hook Form + Zod | Validation, performance |
| Data Fetching | TanStack Query | Caching, synchronization |
| Charts | Recharts | Analytics visualizations |

### Database & Messaging Layer
| Component | Technology | Purpose |
|-----------|------------|---------|
| Primary Database | PostgreSQL 16 | Relational data, ACID compliance |
| Caching | Redis 7 | Sessions, caching, rate limiting |
| Message Queue | RabbitMQ | Background jobs + Event broadcasting (single solution) |
| Search (Phase 2) | Elasticsearch | Full-text search for contacts |
| Analytics (Phase 3) | ClickHouse | High-performance analytics |

> **Note:** RabbitMQ handles BOTH background job processing AND event-driven communication. No need for separate job queue (BullMQ) - simplifies architecture and leverages existing RabbitMQ expertise.

### Real-time & Communication
| Component | Technology | Purpose |
|-----------|------------|---------|
| WebSockets | Socket.io | Real-time campaign updates |
| Email Sending | AWS SES + SendGrid (backup) | Transactional & bulk email |
| SMS | Twilio | Global SMS delivery |
| WhatsApp | Twilio WhatsApp API | Business messaging |

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| Cloud Provider | AWS | Primary infrastructure |
| Container Runtime | Docker | Containerization |
| Orchestration | AWS ECS Fargate | Serverless containers |
| CDN | CloudFront | Static asset delivery |
| DNS | Route 53 | Domain management |
| SSL | AWS Certificate Manager | Free SSL certificates |
| File Storage | S3 | Templates, uploads, exports |
| Secrets | AWS Secrets Manager | Credential management |

### DevOps & Monitoring
| Component | Technology | Purpose |
|-----------|------------|---------|
| CI/CD | GitHub Actions | Automated pipelines |
| IaC | Terraform | Infrastructure as code |
| Monitoring | CloudWatch + Sentry | Logs, metrics, errors |
| APM | New Relic (Phase 2) | Performance monitoring |
| Uptime | Better Uptime | Status page, alerts |

---

## SYSTEM ARCHITECTURE

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Web App     │  │  Mobile App  │  │  Public API  │  │  Webhooks    │    │
│  │  (Next.js)   │  │  (Future)    │  │  (REST)      │  │  (Inbound)   │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          └─────────────────┴────────┬────────┴─────────────────┘
                                     │
┌────────────────────────────────────┼────────────────────────────────────────┐
│                           LOAD BALANCER (ALB)                               │
│                     ┌──────────────┴──────────────┐                         │
│                     │    AWS Application LB       │                         │
│                     │    - SSL Termination        │                         │
│                     │    - Health Checks          │                         │
│                     └──────────────┬──────────────┘                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
┌────────────────────────────────────┼────────────────────────────────────────┐
│                           API GATEWAY LAYER                                  │
│  ┌─────────────────────────────────┴─────────────────────────────────────┐  │
│  │                         NestJS API Server                              │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │    Auth     │  │  Campaigns  │  │  Contacts   │  │  Analytics  │   │  │
│  │  │   Module    │  │   Module    │  │   Module    │  │   Module    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  Billing    │  │ Automation  │  │   Users     │  │    API      │   │  │
│  │  │   Module    │  │   Module    │  │   Module    │  │   Module    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   PostgreSQL     │    │      Redis       │    │    RabbitMQ      │
│   (AWS RDS)      │    │  (ElastiCache)   │    │   (Amazon MQ)    │
│                  │    │                  │    │                  │
│ - User Data      │    │ - Session Cache  │    │ - Job Queues     │
│ - Campaigns      │    │ - Rate Limiting  │    │ - Event Bus      │
│ - Contacts       │    │ - API Caching    │    │ - Pub/Sub        │
│ - Analytics      │    │                  │    │ - Delayed Jobs   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WORKER SERVICES                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Email Worker   │  │   SMS Worker    │  │ WhatsApp Worker │             │
│  │                 │  │                 │  │                 │             │
│  │ - Send emails   │  │ - Send SMS      │  │ - Send messages │             │
│  │ - Track opens   │  │ - Track delivery│  │ - Handle replies│             │
│  │ - Handle bounce │  │ - Handle replies│  │ - Media upload  │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           ▼                    ▼                    ▼                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │    AWS SES      │  │     Twilio      │  │ Twilio WhatsApp │             │
│  │   + SendGrid    │  │      SMS        │  │      API        │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEBHOOK HANDLERS                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  SES Webhooks   │  │ Twilio Webhooks │  │ Stripe Webhooks │             │
│  │                 │  │                 │  │                 │             │
│  │ - Bounces       │  │ - Delivery      │  │ - Payments      │             │
│  │ - Complaints    │  │ - Status        │  │ - Subscriptions │             │
│  │ - Deliveries    │  │ - Replies       │  │ - Invoices      │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Tenant Architecture

**Approach: Shared Database with Row-Level Security**

```
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE DATABASE                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Every table has: tenant_id (UUID) + RLS Policies         │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │  Tenant A   │  │  Tenant B   │  │  Tenant C   │       │  │
│  │  │  Data       │  │  Data       │  │  Data       │       │  │
│  │  │tenant_id=1  │  │tenant_id=2  │  │tenant_id=3  │       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  PostgreSQL Row-Level Security (RLS):                           │
│  - Automatically filters queries by tenant_id                   │
│  - Prevents cross-tenant data access                            │
│  - Set via: SET app.current_tenant = 'tenant_uuid'              │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Simple to maintain
- Cost-effective (single database)
- Easy migrations
- PostgreSQL RLS provides security isolation

---

## RABBITMQ ARCHITECTURE

RabbitMQ serves as the **single messaging solution** for both background job processing and event-driven communication.

### Exchange & Queue Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              RABBITMQ                                        │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           EXCHANGES                                     │ │
│  │                                                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │ │
│  │  │      jobs       │  │     events      │  │       dlx       │        │ │
│  │  │    (direct)     │  │    (topic)      │  │    (fanout)     │        │ │
│  │  │                 │  │                 │  │  Dead Letter    │        │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │ │
│  │           │                    │                    │                  │ │
│  └───────────┼────────────────────┼────────────────────┼──────────────────┘ │
│              │                    │                    │                    │
│  ┌───────────┼────────────────────┼────────────────────┼──────────────────┐ │
│  │           ▼       QUEUES       ▼                    ▼                  │ │
│  │                                                                        │ │
│  │  JOB QUEUES:                  EVENT QUEUES:         RETRY/DLX:        │ │
│  │  ┌─────────────────┐          ┌─────────────────┐   ┌──────────────┐  │ │
│  │  │ jobs.email.send │          │ events.campaign │   │ dlx.failed   │  │ │
│  │  │ jobs.sms.send   │          │ events.contact  │   │ dlx.retry    │  │ │
│  │  │ jobs.whatsapp   │          │ events.email    │   │              │  │ │
│  │  │ jobs.import     │          │ events.payment  │   │              │  │ │
│  │  │ jobs.export     │          │ events.webhook  │   │              │  │ │
│  │  │ jobs.report     │          │                 │   │              │  │ │
│  │  └─────────────────┘          └─────────────────┘   └──────────────┘  │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Queue Definitions

```typescript
// ============================================
// JOB QUEUES (Direct Exchange - One consumer per job)
// ============================================

const JOB_QUEUES = {
  // Email Jobs
  EMAIL_SEND: 'jobs.email.send',           // Send single email
  EMAIL_BULK: 'jobs.email.bulk',           // Process bulk campaign

  // SMS Jobs
  SMS_SEND: 'jobs.sms.send',               // Send single SMS
  SMS_BULK: 'jobs.sms.bulk',               // Process bulk SMS campaign

  // WhatsApp Jobs
  WHATSAPP_SEND: 'jobs.whatsapp.send',     // Send single WhatsApp message
  WHATSAPP_BULK: 'jobs.whatsapp.bulk',     // Process bulk WhatsApp campaign

  // Data Processing Jobs
  IMPORT_CONTACTS: 'jobs.import.contacts', // CSV/Excel import
  EXPORT_CONTACTS: 'jobs.export.contacts', // Export to CSV
  EXPORT_REPORT: 'jobs.export.report',     // Generate PDF report

  // Webhook Jobs
  WEBHOOK_DELIVER: 'jobs.webhook.deliver', // Deliver outbound webhook

  // Scheduled Jobs
  CAMPAIGN_SCHEDULED: 'jobs.campaign.scheduled', // Scheduled campaign trigger
  AUTOMATION_STEP: 'jobs.automation.step',       // Automation workflow step
};

// ============================================
// EVENT TOPICS (Topic Exchange - Multiple consumers)
// ============================================

const EVENTS = {
  // Contact Events
  'contact.created': 'Contact was created',
  'contact.updated': 'Contact was updated',
  'contact.deleted': 'Contact was deleted',
  'contact.unsubscribed': 'Contact unsubscribed',
  'contact.imported': 'Contacts import completed',

  // Campaign Events
  'campaign.created': 'Campaign was created',
  'campaign.started': 'Campaign sending started',
  'campaign.completed': 'Campaign sending completed',
  'campaign.paused': 'Campaign was paused',

  // Email Events (from webhooks)
  'email.sent': 'Email was sent',
  'email.delivered': 'Email was delivered',
  'email.opened': 'Email was opened',
  'email.clicked': 'Link was clicked',
  'email.bounced': 'Email bounced',
  'email.complained': 'Spam complaint received',

  // SMS Events
  'sms.sent': 'SMS was sent',
  'sms.delivered': 'SMS was delivered',
  'sms.failed': 'SMS delivery failed',

  // Payment Events (from Stripe webhooks)
  'payment.received': 'Payment was received',
  'subscription.created': 'Subscription created',
  'subscription.updated': 'Subscription updated',
  'subscription.cancelled': 'Subscription cancelled',
};
```

### NestJS RabbitMQ Integration

```typescript
// rabbitmq.module.ts
import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

@Module({
  imports: [
    RabbitMQModule.forRoot(RabbitMQModule, {
      uri: process.env.RABBITMQ_URL,
      exchanges: [
        { name: 'jobs', type: 'direct' },
        { name: 'events', type: 'topic' },
        { name: 'dlx', type: 'fanout' },
        { name: 'delayed', type: 'x-delayed-message', options: { arguments: { 'x-delayed-type': 'direct' } } },
      ],
      connectionInitOptions: { wait: true },
      enableControllerDiscovery: true,
    }),
  ],
  exports: [RabbitMQModule],
})
export class RabbitMQConfigModule {}
```

```typescript
// email.producer.ts - Publishing jobs
import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class EmailProducer {
  constructor(private readonly amqp: AmqpConnection) {}

  async queueEmail(data: SendEmailDto) {
    await this.amqp.publish('jobs', 'jobs.email.send', {
      id: crypto.randomUUID(),
      data,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  }

  async queueBulkCampaign(campaignId: string, contactIds: string[]) {
    // Publish event that campaign started
    await this.amqp.publish('events', 'campaign.started', { campaignId });

    // Queue individual email jobs
    for (const contactId of contactIds) {
      await this.amqp.publish('jobs', 'jobs.email.send', {
        campaignId,
        contactId,
      });
    }
  }

  async scheduleCampaign(campaignId: string, sendAt: Date) {
    const delay = sendAt.getTime() - Date.now();

    await this.amqp.publish('delayed', 'jobs.campaign.scheduled',
      { campaignId },
      { headers: { 'x-delay': delay } }
    );
  }
}
```

```typescript
// email.consumer.ts - Processing jobs
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class EmailConsumer {
  constructor(
    private readonly emailService: EmailService,
    private readonly amqp: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: 'jobs',
    routingKey: 'jobs.email.send',
    queue: 'jobs.email.send',
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'dlx',
        'x-dead-letter-routing-key': 'dlx.email.failed',
      },
    },
  })
  async handleSendEmail(msg: EmailJobMessage) {
    try {
      const result = await this.emailService.send(msg.data);

      // Publish success event
      await this.amqp.publish('events', 'email.sent', {
        campaignId: msg.data.campaignId,
        contactId: msg.data.contactId,
        messageId: result.messageId,
      });

    } catch (error) {
      if (msg.attempts < 3) {
        // Requeue with incremented attempts
        await this.amqp.publish('jobs', 'jobs.email.send', {
          ...msg,
          attempts: msg.attempts + 1,
        });
      }
      // After 3 attempts, message goes to DLX
      return new Nack(false); // Don't requeue, send to DLX
    }
  }
}
```

```typescript
// analytics.listener.ts - Listening to events
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class AnalyticsListener {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @RabbitSubscribe({
    exchange: 'events',
    routingKey: 'email.*', // Listen to all email events
    queue: 'analytics.email.events',
  })
  async handleEmailEvent(msg: EmailEvent) {
    await this.analyticsService.recordEvent(msg);
  }

  @RabbitSubscribe({
    exchange: 'events',
    routingKey: 'campaign.*',
    queue: 'analytics.campaign.events',
  })
  async handleCampaignEvent(msg: CampaignEvent) {
    await this.analyticsService.updateCampaignStats(msg);
  }
}
```

### Message Flow Example

```
User clicks "Send Campaign" (1000 contacts)
│
▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. API Server                                                    │
│    - Validates request                                           │
│    - Creates campaign record in PostgreSQL                       │
│    - Publishes to RabbitMQ:                                      │
│      • EVENT: campaign.started                                   │
│      • JOBS: 1000 x jobs.email.send                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. RabbitMQ                                                      │
│    - Routes campaign.started → events exchange → listeners       │
│    - Routes jobs.email.send → jobs exchange → email workers      │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ 3a. Analytics Listener  │     │ 3b. Email Workers (x3)  │
│     - Records start     │     │     - Pick up jobs      │
│     - Updates dashboard │     │     - Send via AWS SES  │
└─────────────────────────┘     │     - Publish events    │
                                └────────────┬────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. For each email sent:                                          │
│    - Worker publishes: email.sent event                          │
│    - Analytics listener: increments sent_count                   │
│    - Webhook listener: notifies customer's endpoint              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. When all emails sent:                                         │
│    - Last worker publishes: campaign.completed event             │
│    - Analytics: calculates final stats                           │
│    - Notification: emails user "Campaign sent successfully!"     │
└─────────────────────────────────────────────────────────────────┘
```

### Retry & Dead Letter Strategy

```typescript
// Queue configuration with retry logic
const queueConfig = {
  'jobs.email.send': {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'dlx',
      'x-dead-letter-routing-key': 'dlx.email.failed',
      'x-message-ttl': 86400000, // 24 hours max
    },
  },
};

// Retry queue (waits 60 seconds then retries)
const retryQueueConfig = {
  'retry.email': {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'jobs',
      'x-dead-letter-routing-key': 'jobs.email.send',
      'x-message-ttl': 60000, // 60 second delay
    },
  },
};
```

---

## DATABASE DESIGN

### Core Schema (MVP)

```sql
-- =============================================
-- TENANT & USER MANAGEMENT
-- =============================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_id UUID REFERENCES plans(id),
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, cancelled
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'member', -- owner, admin, manager, member
    avatar_url VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL, -- Store hashed, never plain
    key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for identification
    scopes JSONB DEFAULT '["read"]', -- Permissions
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- CONTACT MANAGEMENT
-- =============================================

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255),
    phone VARCHAR(50),
    whatsapp_number VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    source VARCHAR(50), -- import, api, form, manual
    status VARCHAR(20) DEFAULT 'active', -- active, unsubscribed, bounced, complained
    email_status VARCHAR(20) DEFAULT 'active', -- active, unsubscribed, bounced
    sms_status VARCHAR(20) DEFAULT 'active',
    whatsapp_status VARCHAR(20) DEFAULT 'active',
    engagement_score INTEGER DEFAULT 0,
    last_activity_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_contacts_email ON contacts(tenant_id, email);
CREATE INDEX idx_contacts_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX idx_contacts_custom_fields ON contacts USING GIN(custom_fields);

CREATE TABLE contact_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'static', -- static, dynamic
    filter_criteria JSONB, -- For dynamic lists
    contact_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE contact_list_members (
    contact_list_id UUID REFERENCES contact_lists(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (contact_list_id, contact_id)
);

-- =============================================
-- CAMPAIGNS
-- =============================================

CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- email, sms, whatsapp
    status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, sending, sent, paused, cancelled

    -- Audience
    contact_list_ids UUID[] DEFAULT '{}',
    segment_criteria JSONB,

    -- Content
    subject VARCHAR(500), -- Email subject
    preview_text VARCHAR(255), -- Email preview
    content TEXT, -- HTML for email, text for SMS
    template_id UUID,

    -- Sender Info
    from_name VARCHAR(100),
    from_email VARCHAR(255),
    reply_to VARCHAR(255),

    -- Scheduling
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- A/B Testing
    is_ab_test BOOLEAN DEFAULT FALSE,
    ab_test_config JSONB,

    -- Stats (denormalized for quick access)
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    complained_count INTEGER DEFAULT 0,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_status ON campaigns(tenant_id, status);
CREATE INDEX idx_campaigns_type ON campaigns(tenant_id, type);

-- =============================================
-- MESSAGE TRACKING
-- =============================================

CREATE TABLE campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,

    -- Message details
    message_type VARCHAR(20) NOT NULL, -- email, sms, whatsapp
    external_id VARCHAR(255), -- Provider message ID (SES, Twilio)

    -- Recipient info (denormalized)
    to_email VARCHAR(255),
    to_phone VARCHAR(50),

    -- Status tracking
    status VARCHAR(20) DEFAULT 'queued', -- queued, sent, delivered, opened, clicked, bounced, failed

    -- Timestamps
    queued_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    bounced_at TIMESTAMP,
    failed_at TIMESTAMP,

    -- Error handling
    error_code VARCHAR(50),
    error_message TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_messages_campaign ON campaign_messages(campaign_id);
CREATE INDEX idx_messages_contact ON campaign_messages(contact_id);
CREATE INDEX idx_messages_external ON campaign_messages(external_id);
CREATE INDEX idx_messages_status ON campaign_messages(tenant_id, status);

-- Click/Open tracking
CREATE TABLE campaign_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_message_id UUID REFERENCES campaign_messages(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    event_type VARCHAR(20) NOT NULL, -- open, click, unsubscribe, bounce, complaint

    -- Click specific
    link_url TEXT,
    link_id VARCHAR(50),

    -- Context
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(20), -- desktop, mobile, tablet
    country VARCHAR(2),
    city VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_campaign ON campaign_events(campaign_id);
CREATE INDEX idx_events_type ON campaign_events(tenant_id, event_type);
CREATE INDEX idx_events_time ON campaign_events(tenant_id, created_at);

-- =============================================
-- EMAIL TEMPLATES
-- =============================================

CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50), -- newsletter, promotional, transactional
    subject VARCHAR(500),
    html_content TEXT,
    json_content JSONB, -- For drag-drop builder
    thumbnail_url VARCHAR(500),
    is_system BOOLEAN DEFAULT FALSE, -- Pre-built templates
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- BILLING & SUBSCRIPTIONS
-- =============================================

CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,

    -- Pricing
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    stripe_price_id_monthly VARCHAR(255),
    stripe_price_id_yearly VARCHAR(255),

    -- Limits
    max_contacts INTEGER,
    max_emails_per_month INTEGER,
    max_sms_per_month INTEGER,
    max_whatsapp_per_month INTEGER,
    max_team_members INTEGER,
    max_automations INTEGER,

    -- Features
    features JSONB DEFAULT '{}',

    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES plans(id),

    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),

    status VARCHAR(20) DEFAULT 'active', -- active, past_due, cancelled, trialing
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly

    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    emails_sent INTEGER DEFAULT 0,
    sms_sent INTEGER DEFAULT 0,
    whatsapp_sent INTEGER DEFAULT 0,
    contacts_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(tenant_id, period_start)
);

-- =============================================
-- AUTOMATIONS (Phase 2)
-- =============================================

CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    status VARCHAR(20) DEFAULT 'draft', -- draft, active, paused

    -- Trigger configuration
    trigger_type VARCHAR(50) NOT NULL, -- contact_added, tag_added, form_submitted, date_based, etc.
    trigger_config JSONB DEFAULT '{}',

    -- Workflow definition (nodes and edges)
    workflow JSONB DEFAULT '{"nodes": [], "edges": []}',

    -- Stats
    total_entered INTEGER DEFAULT 0,
    total_completed INTEGER DEFAULT 0,
    total_active INTEGER DEFAULT 0,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE automation_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID REFERENCES automations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,

    status VARCHAR(20) DEFAULT 'active', -- active, completed, exited, failed
    current_step_id VARCHAR(100),

    entered_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    next_action_at TIMESTAMP,

    step_history JSONB DEFAULT '[]',

    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Example RLS policy
CREATE POLICY tenant_isolation_contacts ON contacts
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_campaigns ON campaigns
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

---

## SERVICE PROVIDERS

### Email: AWS SES (Primary) + SendGrid (Backup)

**AWS SES Configuration:**
```
Region: us-east-1 (best deliverability)
Setup Required:
1. Verify domain (DNS records)
2. Set up DKIM (2048-bit keys)
3. Configure SPF record
4. Set up DMARC policy
5. Request production access
6. Configure SNS for webhooks
7. Set up configuration sets for tracking
```

**Pricing:**
| Tier | Cost |
|------|------|
| First 62,000/month | Free (if sent from EC2) |
| After 62,000 | $0.10 per 1,000 emails |
| Dedicated IP | $24.95/month per IP |

**SendGrid (Backup):**
- Used when SES deliverability issues
- Automatic failover
- $19.95/month for 50,000 emails

### SMS: Twilio

**Configuration:**
```
- Programmable SMS API
- Toll-free number or short code
- Messaging Service SID for scale
- Webhook URL for delivery status
```

**Pricing:**
| Type | Cost |
|------|------|
| Outbound SMS (US) | $0.0079/message |
| Inbound SMS (US) | $0.0079/message |
| Phone Number | $1.00/month |
| Short Code | $1,000/month |

### WhatsApp: Twilio WhatsApp Business API

**Requirements:**
1. Meta Business Verification (2-4 weeks)
2. WhatsApp Business Account
3. Approved message templates
4. Twilio WhatsApp Sender setup

**Pricing (Conversation-based):**
| Category | Cost (US) |
|----------|-----------|
| Marketing | $0.025/conversation |
| Utility | $0.015/conversation |
| Service | $0.0088/conversation |

### Payment: Stripe

**Features Used:**
- Stripe Checkout (hosted payment page)
- Stripe Billing (subscriptions)
- Customer Portal (self-service)
- Webhooks for events
- Stripe Tax (automatic tax calculation)

**Pricing:**
- 2.9% + $0.30 per transaction
- No monthly fees

---

## FEATURE BREAKDOWN BY PHASE

### PHASE 1A: MVP Core (Months 1-3)

#### Sprint 1-2: Foundation (Weeks 1-4)

**Authentication & User Management**
- [ ] Email/password registration
- [ ] Email verification flow
- [ ] Login with JWT tokens
- [ ] Password reset flow
- [ ] Google OAuth integration
- [ ] Session management with Redis
- [ ] Multi-tenant setup (tenant creation on signup)

**Team Management**
- [ ] Invite team members via email
- [ ] Role-based access (Owner, Admin, Manager, Member)
- [ ] Remove team members
- [ ] Role permissions matrix

**Account Settings**
- [ ] Profile update (name, avatar)
- [ ] Password change
- [ ] Organization settings (name, timezone)
- [ ] Email notification preferences

#### Sprint 3-4: Contact Management (Weeks 5-8)

**Contact CRUD**
- [ ] Add single contact manually
- [ ] Edit contact details
- [ ] Delete contacts (soft delete)
- [ ] View contact profile with activity history

**Import/Export**
- [ ] CSV import with field mapping
- [ ] Excel import (.xlsx)
- [ ] Duplicate detection and merge options
- [ ] Export contacts to CSV
- [ ] Import progress tracking

**Organization**
- [ ] Create contact lists
- [ ] Add/remove contacts from lists
- [ ] Tag contacts (add, remove, bulk)
- [ ] Custom fields (text, number, date, dropdown)
- [ ] Basic search and filtering
- [ ] Pagination and sorting

#### Sprint 5-6: Email Marketing (Weeks 9-12)

**Email Composer**
- [ ] Rich text editor (TipTap/Quill)
- [ ] HTML code editor option
- [ ] Personalization tokens ({{first_name}}, etc.)
- [ ] Preview in desktop/mobile views
- [ ] Send test email

**Templates**
- [ ] 20 pre-built email templates
- [ ] Save as template
- [ ] Template categories
- [ ] Clone templates

**Campaign Management**
- [ ] Create email campaign
- [ ] Select recipients (lists, tags, all contacts)
- [ ] Schedule for later
- [ ] Send immediately
- [ ] Campaign status tracking

**Deliverability**
- [ ] SPF/DKIM/DMARC setup guide
- [ ] Bounce handling (automatic status update)
- [ ] Complaint handling
- [ ] Unsubscribe link (automatic)
- [ ] Unsubscribe page

**Tracking**
- [ ] Open tracking (pixel)
- [ ] Click tracking (link wrapping)
- [ ] Real-time stats dashboard

---

### PHASE 1B: MVP Extended (Months 4-5)

#### Sprint 7-8: SMS Marketing (Weeks 13-16)

**SMS Composer**
- [ ] SMS text composer
- [ ] Character counter (160/306/459)
- [ ] Unicode detection (reduces char limit)
- [ ] Link shortening
- [ ] Personalization tokens
- [ ] Preview

**SMS Campaigns**
- [ ] Create SMS campaign
- [ ] Select recipients (with phone numbers)
- [ ] Schedule SMS
- [ ] Send immediately
- [ ] Delivery status tracking

**Compliance**
- [ ] Opt-out handling ("STOP" keyword)
- [ ] Opt-out confirmation
- [ ] Quiet hours setting

#### Sprint 9-10: Analytics & A/B Testing (Weeks 17-20)

**Campaign Analytics**
- [ ] Email metrics dashboard (sent, delivered, opens, clicks, bounces)
- [ ] SMS metrics dashboard (sent, delivered, failed)
- [ ] Open/click rate calculations
- [ ] Best performing links
- [ ] Geographic breakdown
- [ ] Device breakdown (desktop/mobile)
- [ ] Export reports (CSV, PDF)

**A/B Testing (Email)**
- [ ] Subject line A/B test (2 variants)
- [ ] Winner selection criteria (open rate, click rate)
- [ ] Test percentage (10-50%)
- [ ] Automatic winner deployment

**Dashboard**
- [ ] Overview dashboard with key metrics
- [ ] Recent campaigns
- [ ] Contact growth chart
- [ ] Engagement trends

#### Sprint 11: Billing & API (Weeks 21-22)

**Billing**
- [ ] Stripe Checkout integration
- [ ] 4 pricing tiers (Free, Starter $29, Growth $79, Pro $199)
- [ ] Monthly/yearly toggle
- [ ] Usage tracking and limits
- [ ] Upgrade/downgrade flows
- [ ] Invoice history
- [ ] Customer portal link

**Public API**
- [ ] API key generation
- [ ] API key management (create, revoke, scopes)
- [ ] REST endpoints for contacts
- [ ] REST endpoints for campaigns
- [ ] Rate limiting (1000 req/hour)
- [ ] API documentation (Swagger)
- [ ] Webhook configuration
- [ ] Webhook delivery with retries

---

### PHASE 2: Growth Features (Months 6-9)

#### WhatsApp Marketing
- [ ] WhatsApp Business API setup
- [ ] Template message creation
- [ ] Template approval workflow
- [ ] Send template messages
- [ ] Media messages (images, PDFs, videos)
- [ ] Interactive buttons (up to 3)
- [ ] Quick reply buttons
- [ ] Message status tracking
- [ ] Conversation inbox

#### Visual Automation Builder
- [ ] Drag-and-drop workflow canvas
- [ ] Trigger nodes:
  - Contact added to list
  - Tag added
  - Form submitted
  - Date-based (birthday, anniversary)
  - Custom event
- [ ] Action nodes:
  - Send email
  - Send SMS
  - Send WhatsApp
  - Wait (delay)
  - Add/remove tag
  - Update contact field
  - Add to list
  - Webhook
- [ ] Condition nodes:
  - If/else logic
  - Contact field conditions
  - Engagement conditions
- [ ] 10 pre-built automation templates
- [ ] Automation analytics

#### Advanced Segmentation
- [ ] Segment builder with AND/OR logic
- [ ] Behavioral conditions (opened, clicked, didn't open)
- [ ] Engagement scoring
- [ ] Dynamic segments (auto-update)
- [ ] Segment size estimation

#### Forms & Landing Pages
- [ ] Form builder (drag-and-drop)
- [ ] Form fields (text, email, phone, dropdown, checkbox)
- [ ] Embed code generation
- [ ] Pop-up forms (exit intent, timed, scroll)
- [ ] Landing page builder (basic)
- [ ] 20 landing page templates
- [ ] Custom domain support
- [ ] Form analytics

#### Integrations
- [ ] Zapier integration
- [ ] Webhook triggers (outbound)
- [ ] Webhook actions (inbound)
- [ ] Shopify integration
- [ ] WooCommerce integration
- [ ] WordPress plugin

---

### PHASE 3: Advanced Features (Months 10-14)

#### AI Features
- [ ] AI subject line generator (OpenAI GPT-4)
- [ ] AI email content writer
- [ ] AI-powered send time optimization
- [ ] Predictive engagement scoring
- [ ] Smart segmentation suggestions

#### E-commerce Features
- [ ] Product catalog sync (Shopify/WooCommerce)
- [ ] Abandoned cart recovery automation
- [ ] Purchase tracking
- [ ] Product recommendation blocks
- [ ] Order confirmation templates
- [ ] Revenue attribution

#### Advanced Analytics
- [ ] Customer journey visualization
- [ ] Funnel reports
- [ ] Cohort analysis
- [ ] Custom report builder
- [ ] Scheduled report delivery
- [ ] Multi-touch attribution

#### WhatsApp Chatbot
- [ ] Chatbot flow builder
- [ ] Quick reply handling
- [ ] Button response routing
- [ ] AI-powered responses (optional)
- [ ] Business hours
- [ ] Agent handoff

#### Enterprise Features
- [ ] White-label option
- [ ] Custom branding
- [ ] Dedicated IP addresses
- [ ] IP warmup scheduler
- [ ] SSO (SAML)
- [ ] Audit logs
- [ ] Advanced permissions

---

## API DESIGN

### Authentication

```
POST   /api/v1/auth/register        - Register new account
POST   /api/v1/auth/login           - Login (returns JWT)
POST   /api/v1/auth/logout          - Logout (invalidate token)
POST   /api/v1/auth/refresh         - Refresh access token
POST   /api/v1/auth/forgot-password - Request password reset
POST   /api/v1/auth/reset-password  - Reset password with token
POST   /api/v1/auth/verify-email    - Verify email address
GET    /api/v1/auth/me              - Get current user
```

### Contacts

```
GET    /api/v1/contacts             - List contacts (paginated)
POST   /api/v1/contacts             - Create contact
GET    /api/v1/contacts/:id         - Get contact
PUT    /api/v1/contacts/:id         - Update contact
DELETE /api/v1/contacts/:id         - Delete contact
POST   /api/v1/contacts/import      - Import contacts (CSV/Excel)
GET    /api/v1/contacts/export      - Export contacts
POST   /api/v1/contacts/:id/tags    - Add tags to contact
DELETE /api/v1/contacts/:id/tags    - Remove tags from contact
```

### Contact Lists

```
GET    /api/v1/lists                - List all lists
POST   /api/v1/lists                - Create list
GET    /api/v1/lists/:id            - Get list details
PUT    /api/v1/lists/:id            - Update list
DELETE /api/v1/lists/:id            - Delete list
GET    /api/v1/lists/:id/contacts   - Get contacts in list
POST   /api/v1/lists/:id/contacts   - Add contacts to list
DELETE /api/v1/lists/:id/contacts   - Remove contacts from list
```

### Campaigns

```
GET    /api/v1/campaigns            - List campaigns
POST   /api/v1/campaigns            - Create campaign
GET    /api/v1/campaigns/:id        - Get campaign
PUT    /api/v1/campaigns/:id        - Update campaign
DELETE /api/v1/campaigns/:id        - Delete campaign
POST   /api/v1/campaigns/:id/send   - Send campaign immediately
POST   /api/v1/campaigns/:id/schedule - Schedule campaign
POST   /api/v1/campaigns/:id/pause  - Pause sending
POST   /api/v1/campaigns/:id/resume - Resume sending
POST   /api/v1/campaigns/:id/test   - Send test
GET    /api/v1/campaigns/:id/stats  - Get campaign statistics
```

### Templates

```
GET    /api/v1/templates            - List templates
POST   /api/v1/templates            - Create template
GET    /api/v1/templates/:id        - Get template
PUT    /api/v1/templates/:id        - Update template
DELETE /api/v1/templates/:id        - Delete template
POST   /api/v1/templates/:id/clone  - Clone template
```

### Webhooks

```
GET    /api/v1/webhooks             - List webhooks
POST   /api/v1/webhooks             - Create webhook
GET    /api/v1/webhooks/:id         - Get webhook
PUT    /api/v1/webhooks/:id         - Update webhook
DELETE /api/v1/webhooks/:id         - Delete webhook
GET    /api/v1/webhooks/:id/logs    - Get delivery logs
```

### Billing

```
GET    /api/v1/billing/plans        - List available plans
GET    /api/v1/billing/subscription - Get current subscription
POST   /api/v1/billing/subscribe    - Subscribe to plan
POST   /api/v1/billing/change-plan  - Change plan
POST   /api/v1/billing/cancel       - Cancel subscription
GET    /api/v1/billing/invoices     - List invoices
GET    /api/v1/billing/usage        - Get current usage
POST   /api/v1/billing/portal       - Get Stripe portal URL
```

---

## SECURITY IMPLEMENTATION

### Authentication Security

```typescript
// JWT Configuration
{
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  algorithm: 'RS256',
  issuer: 'marketing-platform',
}

// Password Requirements
{
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
}

// Rate Limiting
{
  login: '5 requests per minute per IP',
  register: '3 requests per minute per IP',
  passwordReset: '3 requests per hour per email',
  api: '1000 requests per hour per API key',
}
```

### Data Security

| Area | Implementation |
|------|----------------|
| Passwords | bcrypt with cost factor 12 |
| API Keys | SHA-256 hash, only show once |
| Data at Rest | PostgreSQL encryption, S3 SSE |
| Data in Transit | TLS 1.3 everywhere |
| PII | Field-level encryption for sensitive data |
| Sessions | Redis with 24h expiry |

### API Security

```typescript
// Security Headers (Helmet.js)
{
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}
```

### Infrastructure Security

- VPC with private subnets for databases
- Security groups with minimal access
- AWS WAF for DDoS protection
- CloudTrail for audit logging
- Secrets Manager for credentials
- Regular security scanning (Snyk)

### Compliance

| Regulation | Implementation |
|------------|----------------|
| GDPR | Data export, deletion, consent management |
| CAN-SPAM | Unsubscribe link, physical address |
| TCPA | SMS opt-in/opt-out |
| CCPA | Privacy policy, data disclosure |

---

## INFRASTRUCTURE & DEVOPS

### AWS Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VPC (10.0.0.0/16)                       │
│                                                                  │
│  ┌────────────────────────┐  ┌────────────────────────────────┐ │
│  │   Public Subnets       │  │      Private Subnets           │ │
│  │   (10.0.1.0/24)        │  │      (10.0.2.0/24)             │ │
│  │                        │  │                                │ │
│  │  ┌──────────────────┐  │  │  ┌──────────────────────────┐  │ │
│  │  │  ALB (Internet   │  │  │  │  ECS Fargate Cluster     │  │ │
│  │  │  facing)         │──┼──┼─▶│  - API Service (3 tasks) │  │ │
│  │  └──────────────────┘  │  │  │  - Worker Service (2)    │  │ │
│  │                        │  │  │  - Scheduler (1)         │  │ │
│  │  ┌──────────────────┐  │  │  └──────────────────────────┘  │ │
│  │  │  NAT Gateway     │  │  │                                │ │
│  │  └──────────────────┘  │  │  ┌──────────────────────────┐  │ │
│  │                        │  │  │  RDS PostgreSQL          │  │ │
│  └────────────────────────┘  │  │  (Multi-AZ)              │  │ │
│                              │  └──────────────────────────┘  │ │
│                              │                                │ │
│                              │  ┌──────────────────────────┐  │ │
│                              │  │  ElastiCache Redis       │  │ │
│                              │  │  (Cluster mode)          │  │ │
│                              │  └──────────────────────────┘  │ │
│                              │                                │ │
│                              │  ┌──────────────────────────┐  │ │
│                              │  │  Amazon MQ (RabbitMQ)    │  │ │
│                              │  └──────────────────────────┘  │ │
│                              └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │     S3      │  │ CloudFront  │  │   Route53   │             │
│  │  (Storage)  │  │    (CDN)    │  │   (DNS)     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run test:e2e

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ secrets.ECR_REGISTRY }}
          username: ${{ secrets.AWS_ACCESS_KEY_ID }}
          password: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          aws ecs update-service \
            --cluster staging \
            --service api \
            --force-new-deployment

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - run: |
          aws ecs update-service \
            --cluster production \
            --service api \
            --force-new-deployment
```

### Environment Configuration

```bash
# .env.example

# Application
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/marketing
DATABASE_SSL=false

# Redis
REDIS_URL=redis://localhost:6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=marketing-uploads

# AWS SES
SES_FROM_EMAIL=noreply@yourdomain.com
SES_CONFIGURATION_SET=marketing-tracking

# Twilio
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+1234567890

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_STARTER_MONTHLY=price_xxx
STRIPE_PRICE_GROWTH_MONTHLY=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx

# SendGrid (Backup)
SENDGRID_API_KEY=SG.xxx

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

### Monitoring & Alerting

```yaml
# CloudWatch Alarms
Alarms:
  - Name: HighCPUUtilization
    Metric: CPUUtilization
    Threshold: 80%
    Period: 5 minutes
    Action: SNS notification

  - Name: HighMemoryUtilization
    Metric: MemoryUtilization
    Threshold: 80%
    Period: 5 minutes
    Action: SNS notification

  - Name: High5xxErrors
    Metric: HTTPCode_Target_5XX_Count
    Threshold: 10
    Period: 1 minute
    Action: SNS notification + PagerDuty

  - Name: HighLatency
    Metric: TargetResponseTime
    Threshold: 2 seconds
    Period: 5 minutes
    Action: SNS notification

  - Name: DatabaseConnections
    Metric: DatabaseConnections
    Threshold: 80% of max
    Period: 5 minutes
    Action: SNS notification

  - Name: QueueDepth
    Metric: ApproximateNumberOfMessagesVisible
    Threshold: 10000
    Period: 5 minutes
    Action: SNS notification
```

---

## COST ESTIMATES

### Monthly Infrastructure Costs

#### Development/Staging Environment

| Service | Specification | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 2 tasks (0.5 vCPU, 1GB) | $30 |
| RDS PostgreSQL | db.t3.micro | $15 |
| ElastiCache | cache.t3.micro | $13 |
| Amazon MQ | mq.t3.micro | $25 |
| S3 | 10GB storage | $1 |
| CloudFront | 50GB transfer | $5 |
| Route 53 | 1 hosted zone | $1 |
| **Total Staging** | | **~$90/month** |

#### Production Environment (Initial)

| Service | Specification | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 4 tasks (1 vCPU, 2GB) | $120 |
| RDS PostgreSQL | db.t3.medium (Multi-AZ) | $70 |
| ElastiCache | cache.t3.small (2 nodes) | $50 |
| Amazon MQ | mq.m5.large | $150 |
| S3 | 100GB storage | $3 |
| CloudFront | 500GB transfer | $45 |
| ALB | 1 ALB | $20 |
| NAT Gateway | 1 gateway | $35 |
| Route 53 | 1 hosted zone | $1 |
| Secrets Manager | 10 secrets | $5 |
| CloudWatch | Logs + Metrics | $30 |
| **Total Production** | | **~$530/month** |

#### Scaled Production (10,000 customers)

| Service | Specification | Monthly Cost |
|---------|---------------|--------------|
| ECS Fargate | 12 tasks (2 vCPU, 4GB) | $700 |
| RDS PostgreSQL | db.r5.large (Multi-AZ) | $400 |
| ElastiCache | cache.r5.large (3 nodes) | $400 |
| Amazon MQ | mq.m5.xlarge (HA) | $500 |
| Elasticsearch | 3 x t3.medium | $200 |
| S3 | 1TB storage | $25 |
| CloudFront | 5TB transfer | $400 |
| ALB | 1 ALB | $25 |
| NAT Gateway | 2 gateways | $70 |
| WAF | 1 Web ACL | $10 |
| **Total Scaled** | | **~$2,730/month** |

### Service Provider Costs (Usage-Based)

| Service | 10k customers | 50k customers |
|---------|---------------|---------------|
| AWS SES (1M emails) | $100 | $500 (5M) |
| Twilio SMS (100k) | $790 | $3,950 (500k) |
| Twilio WhatsApp | $500 | $2,500 |
| Stripe fees (2.9%) | Based on revenue | Based on revenue |
| **Monthly Service Costs** | **~$1,400** | **~$7,000** |

### Total Monthly Costs

| Stage | Infrastructure | Services | Total |
|-------|---------------|----------|-------|
| MVP (Pre-launch) | $90 | $50 | $140 |
| Launch (100 customers) | $530 | $200 | $730 |
| Growth (1k customers) | $800 | $500 | $1,300 |
| Scale (10k customers) | $2,730 | $1,400 | $4,130 |
| Large (50k customers) | $6,000 | $7,000 | $13,000 |

---

## TEAM STRUCTURE

### MVP Phase (3-4 developers)

| Role | Responsibilities | Count |
|------|-----------------|-------|
| Full-Stack Lead | Architecture, backend core, code review | 1 |
| Backend Developer | APIs, workers, integrations | 1 |
| Frontend Developer | React/Next.js, UI components | 1 |
| DevOps (Part-time) | CI/CD, infrastructure, monitoring | 0.5 |

### Growth Phase (6-8 developers)

| Role | Responsibilities | Count |
|------|-----------------|-------|
| Engineering Manager | Technical leadership, planning | 1 |
| Senior Backend | Core services, performance | 2 |
| Senior Frontend | UI/UX, complex features | 2 |
| Full-Stack | Features across stack | 2 |
| DevOps/SRE | Infrastructure, reliability | 1 |
| QA Engineer | Testing, quality | 1 |

### Scale Phase (12+ developers)

Add specialized roles:
- Data Engineer (analytics, ClickHouse)
- ML Engineer (AI features)
- Security Engineer
- Product Manager
- Designer

---

## RISK MITIGATION

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Email deliverability issues | High | Dedicated IPs, warm-up plan, SendGrid backup |
| Database performance | High | Read replicas, proper indexing, query optimization |
| Third-party API downtime | Medium | Circuit breakers, fallback providers, queuing |
| Security breach | Critical | Regular audits, penetration testing, encryption |
| Data loss | Critical | Automated backups, multi-region replication |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Twilio/AWS price increase | Medium | Negotiate contracts, evaluate alternatives |
| WhatsApp policy changes | High | Diversify channels, follow compliance strictly |
| Competitor features | Medium | Regular market research, rapid iteration |
| Scaling challenges | High | Design for scale from day 1, load testing |

### Compliance Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| GDPR violations | Critical | Data privacy by design, legal review |
| CAN-SPAM violations | High | Automatic unsubscribe, compliance checks |
| TCPA violations (SMS) | High | Opt-in verification, consent tracking |

---

## TIMELINE SUMMARY

```
Month 1-3:   MVP-A (Auth, Contacts, Email, Basic Analytics, Billing)
             ↓
Month 4-5:   MVP-B (SMS, A/B Testing, API, Dashboard)
             ↓
             🚀 LAUNCH (Beta/Early Access)
             ↓
Month 6-9:   Growth (WhatsApp, Automations, Forms, Integrations)
             ↓
             📈 SCALE (Marketing push, customer growth)
             ↓
Month 10-14: Advanced (AI, E-commerce, Analytics, Enterprise)
             ↓
             🎯 MARKET LEADER
```

---

## NEXT STEPS

1. **Immediate (This Week)**
   - Set up AWS account and configure billing alerts
   - Create GitHub repository
   - Set up NestJS project with basic structure
   - Set up Next.js project with Tailwind + shadcn/ui
   - Create development database (PostgreSQL)

2. **Week 1-2**
   - Implement authentication system
   - Set up CI/CD pipeline
   - Create database schema and migrations
   - Build basic UI shell (layout, navigation)

3. **Week 3-4**
   - Build contact management module
   - Implement CSV import
   - Set up AWS SES and verify domain
   - Build email composer

---

## APPENDIX

### Useful Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [Next.js Documentation](https://nextjs.org/docs)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [RabbitMQ Delayed Message Plugin](https://github.com/rabbitmq/rabbitmq-delayed-message-exchange)
- [@golevelup/nestjs-rabbitmq](https://github.com/golevelup/nestjs/tree/master/packages/rabbitmq)
- [AWS SES Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)
- [Twilio SMS Best Practices](https://www.twilio.com/docs/sms/tutorials/best-practices)
- [Stripe Billing Documentation](https://stripe.com/docs/billing)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Glossary

| Term | Definition |
|------|------------|
| Tenant | A customer organization in multi-tenant system |
| Campaign | A single marketing message sent to recipients |
| Automation | A triggered sequence of marketing actions |
| Segment | A filtered group of contacts based on criteria |
| Deliverability | The ability for emails to reach the inbox |
| Bounce | An email that couldn't be delivered |
| Hard Bounce | Permanent delivery failure (invalid email) |
| Soft Bounce | Temporary delivery failure (mailbox full) |

---

*Document Version: 2.1*
*Last Updated: January 2026*
*Change: Updated to use RabbitMQ as single messaging solution (removed BullMQ)*
