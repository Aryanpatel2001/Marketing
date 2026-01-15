# CAMPAIGNS MODULE - Implementation Plan

## Overview

The Campaigns module is the **core feature** of the marketing platform, enabling users to create and send multi-channel marketing campaigns via Email, SMS, and WhatsApp.

---

## Table of Contents

1. [Feature Summary](#feature-summary)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Frontend Components](#frontend-components)
5. [Channel-Specific Flows](#channel-specific-flows)
6. [WhatsApp Template Approval](#whatsapp-template-approval)
7. [Message Queue Architecture](#message-queue-architecture)
8. [Implementation Phases](#implementation-phases)
9. [UI Wireframes](#ui-wireframes)

---

## Feature Summary

### What Users Can Do

- Create campaigns for Email, SMS, or WhatsApp
- Select recipients from contacts or lists
- Use templates or create custom content
- Schedule campaigns for later or send immediately
- Track campaign performance (sent, delivered, opened, clicked)
- Pause/Resume campaigns in progress
- View detailed analytics per campaign

### Channel Comparison

| Feature           | Email                  | SMS             | WhatsApp               |
| ----------------- | ---------------------- | --------------- | ---------------------- |
| Content Type      | HTML + Design          | Plain text      | Pre-approved templates |
| Max Length        | Unlimited              | 1600 chars      | Template-based         |
| Personalization   | {{first_name}}         | {{first_name}}  | {{1}}, {{2}} numbered  |
| Media Support     | Images, attachments    | Links only      | Images, videos, docs   |
| Tracking          | Opens, clicks, bounces | Delivery status | Delivered, read        |
| Approval Required | No                     | No              | Yes (Meta)             |
| Provider          | AWS SES                | Twilio          | Twilio WhatsApp        |
| Cost              | $0.10/1000             | $0.0079/msg     | $0.015-0.025/conv      |

---

## Database Schema

### campaigns

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms', 'whatsapp')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
        'draft',      -- Being created
        'scheduled',  -- Waiting to send
        'sending',    -- Currently sending
        'paused',     -- Paused by user
        'sent',       -- Completed
        'cancelled',  -- Cancelled by user
        'failed'      -- Failed to send
    )),

    -- Template Reference (optional)
    template_id UUID REFERENCES templates(id),

    -- Channel-Specific Content (JSONB for flexibility)
    content JSONB NOT NULL DEFAULT '{}',
    /*
    Email content: {
        subject: string,
        previewText: string,
        fromName: string,
        fromEmail: string,
        replyTo: string,
        htmlContent: string,
        designJson: object (Unlayer)
    }

    SMS content: {
        message: string,
        senderId: string
    }

    WhatsApp content: {
        templateName: string,
        templateId: string,
        category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
        language: string,
        header: { type, content },
        body: string,
        bodyParameters: string[],
        footer: string,
        buttons: array
    }
    */

    -- Audience Selection
    audience_type VARCHAR(20) DEFAULT 'list' CHECK (audience_type IN (
        'all',      -- All contacts
        'list',     -- Specific lists
        'segment'   -- Dynamic segment
    )),
    contact_list_ids UUID[] DEFAULT '{}',
    segment_criteria JSONB,

    -- Scheduling
    send_immediately BOOLEAN DEFAULT true,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Execution Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    paused_at TIMESTAMP WITH TIME ZONE,

    -- Stats (Denormalized for quick access)
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,

    -- Email-specific stats
    opened_count INTEGER DEFAULT 0,
    unique_opens INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    complained_count INTEGER DEFAULT 0,

    -- SMS-specific stats
    -- (uses sent_count, delivered_count, failed_count)

    -- WhatsApp-specific stats
    read_count INTEGER DEFAULT 0,
    replied_count INTEGER DEFAULT 0,

    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_status ON campaigns(tenant_id, status);
CREATE INDEX idx_campaigns_type ON campaigns(tenant_id, type);
CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at)
    WHERE status = 'scheduled';
```

### campaign_messages

Per-recipient message tracking.

```sql
CREATE TABLE campaign_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,

    -- Recipient Info (denormalized)
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(50),
    recipient_name VARCHAR(200),

    -- Provider Tracking
    external_id VARCHAR(255),  -- SES Message ID / Twilio SID

    -- Status
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN (
        'queued',       -- In queue
        'sending',      -- Being sent
        'sent',         -- Sent to provider
        'delivered',    -- Confirmed delivered
        'opened',       -- Email opened
        'clicked',      -- Link clicked
        'bounced',      -- Bounced
        'failed',       -- Failed to send
        'unsubscribed', -- User unsubscribed
        'complained',   -- Spam complaint
        'read'          -- WhatsApp read
    )),

    -- Timestamps
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,

    -- Error Tracking
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Rendered Content (after variable replacement)
    rendered_content JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_campaign ON campaign_messages(campaign_id);
CREATE INDEX idx_messages_contact ON campaign_messages(contact_id);
CREATE INDEX idx_messages_external ON campaign_messages(external_id);
CREATE INDEX idx_messages_status ON campaign_messages(tenant_id, status);
```

### campaign_events

Engagement tracking (opens, clicks, etc.).

```sql
CREATE TABLE campaign_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_message_id UUID REFERENCES campaign_messages(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    tenant_id UUID NOT NULL,

    -- Event Type
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
        'queued', 'sent', 'delivered', 'opened', 'clicked',
        'bounced', 'failed', 'unsubscribed', 'complained',
        'read', 'replied'
    )),

    -- Click Tracking
    link_url TEXT,
    link_id VARCHAR(50),

    -- Context
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(20),  -- desktop, mobile, tablet
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(2),
    city VARCHAR(100),

    -- WhatsApp-specific
    reply_content TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_campaign ON campaign_events(campaign_id);
CREATE INDEX idx_events_message ON campaign_events(campaign_message_id);
CREATE INDEX idx_events_type ON campaign_events(tenant_id, event_type, created_at);
CREATE INDEX idx_events_time ON campaign_events(created_at);
```

### whatsapp_templates (For Meta Approval)

```sql
CREATE TABLE whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Template Identification
    name VARCHAR(100) NOT NULL,           -- Meta template name (lowercase, underscores)
    display_name VARCHAR(255),            -- Human-friendly name

    -- Meta API Fields
    meta_template_id VARCHAR(100),        -- ID from Meta
    meta_namespace VARCHAR(100),          -- Business namespace

    -- Template Configuration
    category VARCHAR(20) NOT NULL CHECK (category IN (
        'MARKETING', 'UTILITY', 'AUTHENTICATION'
    )),
    language VARCHAR(10) NOT NULL DEFAULT 'en',

    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN (
        'draft',     -- Not submitted
        'pending',   -- Waiting Meta approval
        'approved',  -- Ready to use
        'rejected',  -- Rejected by Meta
        'disabled',  -- Disabled by Meta
        'deleted'    -- Deleted
    )),
    rejection_reason TEXT,

    -- Components (JSONB)
    components JSONB NOT NULL DEFAULT '{}',
    /*
    {
        header: { type: 'text' | 'image' | 'video' | 'document', content: '...' },
        body: 'Message with {{1}} and {{2}} variables',
        footer: 'Optional footer',
        buttons: [
            { type: 'QUICK_REPLY', text: 'Yes' },
            { type: 'URL', text: 'Shop', url: 'https://...' },
            { type: 'PHONE', text: 'Call', phoneNumber: '+1...' }
        ]
    }
    */

    -- Variable Definitions
    variables JSONB DEFAULT '[]',
    /*
    [
        { index: 1, name: 'customer_name', sample: 'John' },
        { index: 2, name: 'order_id', sample: '12345' }
    ]
    */

    -- Timestamps
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(tenant_id, name, language)
);

-- Indexes
CREATE INDEX idx_wa_templates_tenant ON whatsapp_templates(tenant_id, status);
CREATE INDEX idx_wa_templates_meta ON whatsapp_templates(meta_template_id);
```

---

## API Endpoints

### Campaigns

```
# CRUD
GET    /api/v1/campaigns              - List campaigns (paginated, filterable)
POST   /api/v1/campaigns              - Create campaign (draft)
GET    /api/v1/campaigns/:id          - Get campaign details
PUT    /api/v1/campaigns/:id          - Update campaign
DELETE /api/v1/campaigns/:id          - Delete campaign

# Actions
POST   /api/v1/campaigns/:id/send     - Send immediately
POST   /api/v1/campaigns/:id/schedule - Schedule for later
POST   /api/v1/campaigns/:id/pause    - Pause sending
POST   /api/v1/campaigns/:id/resume   - Resume sending
POST   /api/v1/campaigns/:id/cancel   - Cancel campaign
POST   /api/v1/campaigns/:id/test     - Send test message
POST   /api/v1/campaigns/:id/duplicate - Duplicate campaign

# Analytics
GET    /api/v1/campaigns/:id/stats    - Get campaign statistics
GET    /api/v1/campaigns/:id/messages - Get message list (paginated)
GET    /api/v1/campaigns/:id/events   - Get event timeline
GET    /api/v1/campaigns/:id/export   - Export report (CSV/PDF)
```

### WhatsApp Templates

```
# CRUD
GET    /api/v1/whatsapp-templates           - List templates
POST   /api/v1/whatsapp-templates           - Create template
GET    /api/v1/whatsapp-templates/:id       - Get template
PUT    /api/v1/whatsapp-templates/:id       - Update template
DELETE /api/v1/whatsapp-templates/:id       - Delete template

# Actions
POST   /api/v1/whatsapp-templates/:id/submit  - Submit for Meta approval
GET    /api/v1/whatsapp-templates/:id/status  - Check approval status

# Webhooks (from Meta)
POST   /webhooks/meta/template-status         - Template status update
```

---

## Frontend Components

### Folder Structure

```
apps/web/src/
├── app/(dashboard)/campaigns/
│   ├── page.tsx                    # Campaigns list
│   ├── new/
│   │   └── page.tsx                # Create campaign wizard
│   ├── [id]/
│   │   ├── page.tsx                # Campaign detail/analytics
│   │   └── edit/
│   │       └── page.tsx            # Edit campaign
│   └── whatsapp-templates/
│       ├── page.tsx                # WhatsApp templates list
│       └── new/
│           └── page.tsx            # Create WhatsApp template
│
├── components/campaigns/
│   ├── campaign-list.tsx           # Campaign table with filters
│   ├── campaign-card.tsx           # Campaign summary card
│   ├── campaign-status-badge.tsx   # Status badges
│   ├── campaign-stats.tsx          # Stats cards
│   ├── campaign-wizard/
│   │   ├── index.tsx               # Wizard container
│   │   ├── step-type.tsx           # Step 1: Select channel
│   │   ├── step-content.tsx        # Step 2: Content/Template
│   │   ├── step-audience.tsx       # Step 3: Select recipients
│   │   ├── step-schedule.tsx       # Step 4: Schedule
│   │   └── step-review.tsx         # Step 5: Review & Send
│   ├── recipient-selector.tsx      # Contact/List picker
│   ├── send-test-dialog.tsx        # Test message dialog
│   └── campaign-progress.tsx       # Real-time sending progress
│
├── components/whatsapp/
│   ├── template-list.tsx           # WhatsApp templates list
│   ├── template-editor.tsx         # Create/Edit template
│   ├── template-preview.tsx        # iPhone mockup preview
│   ├── template-status-badge.tsx   # Approval status
│   └── approval-notification.tsx   # Approval toast/modal
│
└── lib/api/
    ├── campaigns.ts                # Campaign API calls
    └── whatsapp-templates.ts       # WhatsApp template API
```

---

## Channel-Specific Flows

### Email Campaign Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     EMAIL CAMPAIGN FLOW                          │
└─────────────────────────────────────────────────────────────────┘

User creates campaign
        │
        ▼
┌───────────────────┐
│ 1. Select Type    │
│    → Email        │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────┐
│ 2. Content        │     │  Use Template     │
│    ○ Use Template │ ──► │  - Select from    │
│    ○ Custom       │     │    gallery        │
└─────────┬─────────┘     │  - Auto-fill      │
          │               └───────────────────┘
          ▼
┌───────────────────┐
│ 3. Compose Email  │
│    - Subject      │
│    - Preview text │
│    - From name    │
│    - Content      │
│    - Variables    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. Select Audience│
│    - All contacts │
│    - Specific list│
│    - Segment      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. Schedule       │
│    ○ Send now     │
│    ○ Schedule     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 6. Review & Send  │
│    [Send Test]    │
│    [Send Campaign]│
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────┐
│ SENDING PROCESS                                                │
│                                                                │
│ 1. Create campaign_messages for each recipient                 │
│ 2. Queue jobs to RabbitMQ (jobs.email.send)                   │
│ 3. Email workers pick up jobs                                  │
│ 4. Personalize content (replace {{variables}})                 │
│ 5. Send via AWS SES                                            │
│ 6. Update campaign_message status                              │
│ 7. Increment campaign stats                                    │
│                                                                │
│ Webhooks from SES update:                                      │
│ - Delivered → delivered_count++                                │
│ - Opened → opened_count++ (tracking pixel)                     │
│ - Clicked → clicked_count++ (link tracking)                    │
│ - Bounced → bounced_count++, update contact status             │
│ - Complained → complained_count++, update contact status       │
└───────────────────────────────────────────────────────────────┘
```

### SMS Campaign Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SMS CAMPAIGN FLOW                           │
└─────────────────────────────────────────────────────────────────┘

User creates campaign
        │
        ▼
┌───────────────────┐
│ 1. Select Type    │
│    → SMS          │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 2. Compose SMS    │
│                   │
│ ┌───────────────┐ │
│ │ Hi {{name}},  │ │
│ │ Your code is  │ │
│ │ {{code}}      │ │
│ └───────────────┘ │
│                   │
│ Characters: 45    │
│ Segments: 1       │
│ Unicode: No       │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. Select Audience│
│    (with phone #) │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. Schedule       │
│    ○ Send now     │
│    ○ Schedule     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. Review & Send  │
│                   │
│ Est. Cost: $12.50 │
│ (1580 × $0.0079)  │
│                   │
│ [Send Campaign]   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────────┐
│ SENDING PROCESS                                                │
│                                                                │
│ 1. Create campaign_messages for each recipient                 │
│ 2. Queue jobs to RabbitMQ (jobs.sms.send)                     │
│ 3. SMS workers pick up jobs                                    │
│ 4. Personalize message                                         │
│ 5. Send via Twilio                                             │
│ 6. Update status                                               │
│                                                                │
│ Webhooks from Twilio update:                                   │
│ - Delivered → delivered_count++                                │
│ - Failed → failed_count++                                      │
└───────────────────────────────────────────────────────────────┘
```

### WhatsApp Campaign Flow (Complex)

```
┌─────────────────────────────────────────────────────────────────┐
│                   WHATSAPP CAMPAIGN FLOW                         │
└─────────────────────────────────────────────────────────────────┘

User clicks "New WhatsApp Campaign"
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                  CHOOSE TEMPLATE SOURCE                        │
│                                                                │
│  ┌─────────────────────┐     ┌─────────────────────┐          │
│  │  Active Templates   │     │  Create New         │          │
│  │  (Pre-approved)     │     │  Template           │          │
│  │                     │     │                     │          │
│  │  ✓ Instant send     │     │  ⏳ Needs Meta      │          │
│  │  ✓ 12 available     │     │     approval        │          │
│  └──────────┬──────────┘     └──────────┬──────────┘          │
│             │                           │                      │
└─────────────┼───────────────────────────┼──────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────────────┐
│ SELECT APPROVED         │   │ CREATE NEW TEMPLATE              │
│ TEMPLATE                │   │                                  │
│                         │   │ 1. Template name (lowercase)     │
│ ┌─────────────────────┐ │   │ 2. Category (Marketing/Utility)  │
│ │ welcome_message     │ │   │ 3. Language                      │
│ │ Marketing • en      │ │   │ 4. Header (text/image/video)     │
│ └─────────────────────┘ │   │ 5. Body with {{1}} {{2}}         │
│ ┌─────────────────────┐ │   │ 6. Footer                        │
│ │ order_confirmation  │ │   │ 7. Buttons                       │
│ │ Utility • en        │ │   │                                  │
│ └─────────────────────┘ │   │ [Save Draft] [Submit to Meta]    │
│                         │   └──────────────┬──────────────────┘
│ [Use this Template]     │                  │
└───────────┬─────────────┘                  │
            │                                ▼
            │                   ┌─────────────────────────────────┐
            │                   │ META APPROVAL PROCESS            │
            │                   │                                  │
            │                   │ Status: PENDING ⏳               │
            │                   │                                  │
            │                   │ Wait time: Minutes to 24 hours   │
            │                   │                                  │
            │                   │ We'll notify you when approved   │
            │                   └──────────────┬──────────────────┘
            │                                  │
            │                                  ▼
            │                   ┌─────────────────────────────────┐
            │                   │        APPROVED ✅               │
            │                   │                                  │
            │                   │  🔔 Notification:                │
            │                   │  "Template approved!"            │
            │                   │                                  │
            │                   │  [Create Campaign]               │
            │◄──────────────────┴──────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│ FILL TEMPLATE VARIABLES                                        │
│                                                                │
│ Template: welcome_message                                      │
│                                                                │
│ {{1}} - Customer Name                                          │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ ● Use contact field: [First Name ▼]                      │   │
│ │ ○ Static value: _______________                          │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│ {{2}} - Discount Code                                          │
│ ┌─────────────────────────────────────────────────────────┐   │
│ │ ○ Use contact field: [_________ ▼]                       │   │
│ │ ● Static value: [SAVE10]                                 │   │
│ └─────────────────────────────────────────────────────────┘   │
│                                                                │
│                                      [Continue]                │
└───────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│ SELECT AUDIENCE                                                │
│                                                                │
│ ● Contacts with WhatsApp number                                │
│                                                                │
│ Total with WhatsApp: 1,150                                     │
│ Opted in: 1,120                                                │
│ Estimated cost: ~$28 (at $0.025/conversation)                  │
└───────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────┐
│ REVIEW & SEND                                                  │
│                                                                │
│ Campaign: January Welcome                                      │
│ Template: welcome_message (Marketing)                          │
│ Recipients: 1,120 contacts                                     │
│ Cost: ~$28                                                     │
│                                                                │
│ [Send Test]              [Send Campaign]                       │
└───────────────────────────────────────────────────────────────┘
```

---

## WhatsApp Template Approval

### Approval Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                 TEMPLATE APPROVAL SYSTEM                         │
└─────────────────────────────────────────────────────────────────┘

1. User creates template
   │
   ▼
2. Backend saves as DRAFT
   │
   ▼
3. User clicks "Submit for Approval"
   │
   ▼
4. Backend calls Meta API:
   POST https://graph.facebook.com/v18.0/{WABA_ID}/message_templates
   │
   ▼
5. Meta returns:
   { "id": "123456", "status": "PENDING" }
   │
   ▼
6. Backend saves meta_template_id, status = PENDING
   │
   ▼
7. Wait for Meta to review (minutes to 24 hours)
   │
   ├─────────────────────────────────────────────────────┐
   │                                                     │
   │  OPTION A: Webhook (Recommended)                    │
   │                                                     │
   │  Meta calls: POST /webhooks/meta/template-status    │
   │  {                                                  │
   │    "event": "message_template_status_update",       │
   │    "template_id": "123456",                         │
   │    "status": "APPROVED" | "REJECTED"                │
   │  }                                                  │
   │                                                     │
   ├─────────────────────────────────────────────────────┤
   │                                                     │
   │  OPTION B: Polling (Backup)                         │
   │                                                     │
   │  Every 30 seconds:                                  │
   │  GET https://graph.facebook.com/v18.0/{template_id} │
   │                                                     │
   └─────────────────────────────────────────────────────┘
   │
   ▼
8. Update template status in database
   │
   ▼
9. Notify user:
   ├── In-app notification (toast)
   ├── Bell icon notification
   ├── Email notification (optional)
   └── WebSocket/SSE real-time update
```

### Template Status UI

```
┌─────────────────────────────────────────────────────────────────┐
│  WhatsApp Templates                          [+ Create Template] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [All] [Approved ✓] [Pending ⏳] [Rejected ✗]                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Template           │ Category  │ Language │ Status         │ │
│  ├────────────────────┼───────────┼──────────┼────────────────┤ │
│  │ welcome_message    │ Marketing │ en       │ ✅ Approved    │ │
│  │ order_confirm      │ Utility   │ en       │ ✅ Approved    │ │
│  │ promo_jan_2026     │ Marketing │ en       │ ⏳ Pending     │ │
│  │ shipping_update    │ Utility   │ en       │ ❌ Rejected    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ❌ Rejected: shipping_update                                │ │
│  │                                                             │ │
│  │ Reason: "Template marked as UTILITY but contains           │ │
│  │ promotional content. Please change to MARKETING."          │ │
│  │                                                             │ │
│  │ [Edit & Resubmit]                                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Queue Architecture

### RabbitMQ Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                         RABBITMQ                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  EXCHANGES                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │      jobs       │  │     events      │  │       dlx       │  │
│  │    (direct)     │  │    (topic)      │  │    (fanout)     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│  QUEUES   │                    │                    │           │
│  ─────────┼────────────────────┼────────────────────┼─────────  │
│           │                    │                    │           │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐  │
│  │ jobs.email.send │  │events.campaign.*│  │  dlx.failed     │  │
│  │ jobs.sms.send   │  │events.email.*   │  │  dlx.retry      │  │
│  │ jobs.whatsapp   │  │events.sms.*     │  │                 │  │
│  │ jobs.campaign   │  │                 │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Message Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              CAMPAIGN SENDING MESSAGE FLOW                       │
└─────────────────────────────────────────────────────────────────┘

User clicks "Send Campaign" (1000 contacts)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ 1. API Server                                                  │
│    ├── Validate campaign                                       │
│    ├── Update status → 'sending'                               │
│    ├── Create 1000 campaign_messages (status: 'queued')        │
│    ├── Publish event: campaign.started                         │
│    └── Queue 1000 jobs: jobs.{type}.send                       │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ 2. RabbitMQ                                                    │
│    ├── Routes jobs to workers                                  │
│    └── Routes events to listeners                              │
└───────────────────────────────────────────────────────────────┘
        │
        ├─────────────────────────────────────────┐
        ▼                                         ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│ 3. Workers (x3)         │     │ 4. Analytics Listener            │
│                         │     │                                  │
│ For each job:           │     │ On campaign.started:             │
│ ├── Get message details │     │ └── Log start time               │
│ ├── Personalize content │     │                                  │
│ ├── Send via provider   │     │ On email.sent/sms.sent:          │
│ │   ├── Email → SES     │     │ └── Increment sent_count         │
│ │   ├── SMS → Twilio    │     │                                  │
│ │   └── WA → Twilio WA  │     │ On campaign.completed:           │
│ ├── Update message      │     │ └── Calculate final stats        │
│ │   status              │     │                                  │
│ └── Publish event:      │────►│                                  │
│     email.sent          │     │                                  │
└─────────────────────────┘     └─────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ 5. After all sent                                              │
│    ├── Update campaign status → 'sent'                         │
│    ├── Publish event: campaign.completed                       │
│    └── Send notification to user                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Campaign Core (Week 1)

**Backend:**

- [ ] Campaign entity
- [ ] CampaignMessage entity
- [ ] CampaignEvent entity
- [ ] Campaign DTOs (create, update, filter)
- [ ] CampaignsService (CRUD)
- [ ] CampaignsController

**Frontend:**

- [ ] Campaigns list page
- [ ] Campaign status badges
- [ ] Campaign detail page (basic)

### Phase 2: Campaign Wizard (Week 2)

**Frontend:**

- [ ] Campaign creation wizard
- [ ] Step 1: Channel selection
- [ ] Step 2: Content/Template selection
- [ ] Step 3: Audience selection (recipient picker)
- [ ] Step 4: Scheduling
- [ ] Step 5: Review & confirm
- [ ] Send test message dialog

### Phase 3: Email Sending (Week 3)

**Backend:**

- [ ] Email Producer (RabbitMQ)
- [ ] Email Worker/Consumer
- [ ] AWS SES integration
- [ ] Email personalization
- [ ] Tracking pixel generation
- [ ] Link wrapping for click tracking

**Webhooks:**

- [ ] SES webhook endpoint
- [ ] Handle delivered/bounced/complained
- [ ] Handle opens (tracking pixel)

### Phase 4: SMS Sending (Week 4)

**Backend:**

- [ ] SMS Producer
- [ ] SMS Worker/Consumer
- [ ] Twilio SMS integration
- [ ] SMS personalization
- [ ] Character/segment counting

**Webhooks:**

- [ ] Twilio SMS webhook endpoint
- [ ] Handle delivery status

### Phase 5: WhatsApp Integration (Week 5-6)

**Backend:**

- [ ] WhatsAppTemplate entity & service
- [ ] Meta API integration (template submission)
- [ ] Template approval webhook
- [ ] WhatsApp Producer
- [ ] WhatsApp Worker/Consumer
- [ ] Twilio WhatsApp integration

**Frontend:**

- [ ] WhatsApp templates list page
- [ ] Template editor with preview
- [ ] Approval status notifications
- [ ] Template selection in campaign wizard

### Phase 6: Analytics & Polish (Week 7)

**Frontend:**

- [ ] Campaign analytics dashboard
- [ ] Real-time sending progress (SSE)
- [ ] Pause/Resume controls
- [ ] Export reports
- [ ] Performance optimization

---

## UI Wireframes

### Campaigns List Page

```
┌─────────────────────────────────────────────────────────────────┐
│  Campaigns                                    [+ New Campaign]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 📊 Overview                                               │   │
│  │                                                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │   │
│  │  │   12    │ │    3    │ │    2    │ │    1    │        │   │
│  │  │  Total  │ │ Sending │ │ Scheduled│ │  Draft  │        │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [All] [Email] [SMS] [WhatsApp]     🔍 Search campaigns...      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Campaign            │ Type  │ Status   │ Sent  │ Opened  │   │
│  ├─────────────────────┼───────┼──────────┼───────┼─────────┤   │
│  │ January Newsletter  │ 📧    │ ✅ Sent  │ 2,450 │ 42%     │   │
│  │ Flash Sale Alert    │ 💬    │ 🚀 Sending│ 1,200 │ -       │   │
│  │ Order Updates       │ 💚    │ 📅 Sched │ -     │ -       │   │
│  │ Welcome Series      │ 📧    │ 📝 Draft │ -     │ -       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Campaign Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Campaigns                                             │
│                                                                  │
│  January Newsletter                              [Edit] [Duplicate]│
│  📧 Email • Sent Jan 15, 2026                                    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │   2,450    │ │   2,380    │ │   1,023    │ │    245     │   │
│  │    Sent    │ │ Delivered  │ │   Opened   │ │  Clicked   │   │
│  │            │ │   97.1%    │ │   42.9%    │ │   10.3%    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Performance Over Time                                     │   │
│  │                                                           │   │
│  │     ▄▄▄                                                   │   │
│  │    ▄███▄▄                                                 │   │
│  │   ▄██████▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄                                 │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                       │   │
│  │  0h   4h   8h   12h  16h  20h  24h                        │   │
│  │                                                           │   │
│  │  ── Opens  ── Clicks                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Activity] [Recipients] [Links]                                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Recent Activity                                           │   │
│  │                                                           │   │
│  │ • john@example.com opened email          2 min ago        │   │
│  │ • jane@example.com clicked "Shop Now"    5 min ago        │   │
│  │ • bob@example.com opened email           8 min ago        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Notes

### Environment Variables Needed

```env
# AWS SES
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
SES_FROM_EMAIL=noreply@yourdomain.com
SES_CONFIGURATION_SET=marketing-tracking

# Twilio
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_NUMBER=+1234567890

# Meta (WhatsApp Business)
META_WHATSAPP_BUSINESS_ID=xxx
META_ACCESS_TOKEN=xxx
META_WEBHOOK_VERIFY_TOKEN=xxx

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### Dependencies to Install

```bash
# Backend
npm install @golevelup/nestjs-rabbitmq  # RabbitMQ
npm install @aws-sdk/client-ses          # AWS SES
npm install twilio                        # Twilio SMS/WhatsApp

# Frontend
npm install recharts                      # Charts for analytics
npm install framer-motion                 # Animations
```

---

## Summary

The Campaigns module is the most complex feature with:

1. **Three channels** with different requirements
2. **WhatsApp** needs Meta template approval
3. **Message queue** for scalable sending
4. **Webhooks** for delivery tracking
5. **Real-time updates** during sending

**Recommended approach**: Start with Email → SMS → WhatsApp

---

_Document Version: 1.0_
_Created: January 8, 2026_
