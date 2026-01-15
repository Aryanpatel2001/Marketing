# Campaign System Documentation

## Overview

The Campaign System is a scalable, queue-based email marketing platform that supports both immediate and scheduled campaign delivery. Built with NestJS, RabbitMQ, Redis, and AWS SES, it can handle high-volume email campaigns with rate limiting, retry mechanisms, and comprehensive tracking.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Campaign Flow](#campaign-flow)
3. [Queue System](#queue-system)
4. [Database Entities](#database-entities)
5. [API Endpoints](#api-endpoints)
6. [Configuration](#configuration)
7. [Workers](#workers)
8. [Logging](#logging)
9. [Rate Limiting](#rate-limiting)
10. [Error Handling & Retries](#error-handling--retries)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CAMPAIGN SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Frontend  │────▶│  API Server │────▶│  PostgreSQL │                   │
│  │  (Next.js)  │     │  (NestJS)   │     │  Database   │                   │
│  └─────────────┘     └──────┬──────┘     └─────────────┘                   │
│                             │                                               │
│                             ▼                                               │
│                      ┌─────────────┐                                        │
│                      │  RabbitMQ   │                                        │
│                      │   Queues    │                                        │
│                      └──────┬──────┘                                        │
│                             │                                               │
│         ┌───────────────────┼───────────────────┐                          │
│         ▼                   ▼                   ▼                          │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Prepare   │     │    Send     │     │    Retry    │                   │
│  │   Worker    │────▶│   Worker    │────▶│   Worker    │                   │
│  └─────────────┘     └──────┬──────┘     └─────────────┘                   │
│                             │                                               │
│                             ▼                                               │
│                      ┌─────────────┐     ┌─────────────┐                   │
│                      │   AWS SES   │────▶│    Redis    │                   │
│                      │   (Email)   │     │  (Counters) │                   │
│                      └─────────────┘     └─────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component      | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| **API Server** | Handles HTTP requests, campaign CRUD, triggers sending  |
| **RabbitMQ**   | Message broker for job queues and event distribution    |
| **PostgreSQL** | Persistent storage for campaigns, messages, events      |
| **Redis**      | Real-time counters, rate limiting, caching              |
| **AWS SES**    | Email delivery service                                  |
| **Workers**    | Background processors for email preparation and sending |

---

## Campaign Flow

### Immediate Send Flow

```
User clicks "Send Now"
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  POST /api/v1/campaigns/:id/send                              │
│  └─▶ CampaignSendService.sendCampaign()                       │
│      └─▶ Publishes to: email.prepare.queue                    │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  EmailPrepareWorker (consumes from email.prepare.queue)       │
│  ├─▶ Validates campaign status (DRAFT or SCHEDULED)          │
│  ├─▶ Gets recipient count                                     │
│  ├─▶ Updates campaign status to SENDING                       │
│  ├─▶ Creates CampaignMessage records for each recipient       │
│  ├─▶ Initializes Redis counters                               │
│  └─▶ Publishes batch messages to: email.send.queue            │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  EmailSendWorker (consumes from email.send.queue)             │
│  ├─▶ Checks campaign status (skip if PAUSED/CANCELLED)        │
│  ├─▶ Checks SES rate limit via Redis                          │
│  ├─▶ Personalizes email content ({{first_name}}, etc.)        │
│  ├─▶ Adds tracking (open pixel, click tracking, unsubscribe)  │
│  ├─▶ Sends email via AWS SES                                  │
│  ├─▶ Updates message status (SENT/FAILED)                     │
│  ├─▶ Increments Redis counters                                │
│  └─▶ Checks if campaign is complete                           │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Campaign Complete                                            │
│  ├─▶ Status updated to SENT                                   │
│  ├─▶ Final stats persisted to database                        │
│  └─▶ Publishes: campaign.lifecycle.complete event             │
└───────────────────────────────────────────────────────────────┘
```

### Scheduled Send Flow

```
User schedules campaign for specific time
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  POST /api/v1/campaigns/:id/schedule                          │
│  └─▶ CampaignsService.schedule()                              │
│      ├─▶ Validates: campaign must be DRAFT                    │
│      ├─▶ Validates: scheduledAt must be in future             │
│      ├─▶ Sets status = SCHEDULED                              │
│      └─▶ Saves scheduledAt timestamp (UTC)                    │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  CampaignSchedulerService (Cron: Every Minute)                │
│  ├─▶ Queries: status=SCHEDULED AND scheduledAt <= now         │
│  ├─▶ For each ready campaign:                                 │
│  │   └─▶ Calls CampaignSendService.sendCampaign()             │
│  └─▶ (Same flow as Immediate Send continues...)               │
└───────────────────────────────────────────────────────────────┘
```

---

## Queue System

### Exchanges

| Exchange        | Type   | Purpose                                         |
| --------------- | ------ | ----------------------------------------------- |
| `campaigns`     | Topic  | Main campaign operations (prepare, send, retry) |
| `campaigns.dlx` | Direct | Dead Letter Exchange for failed messages        |
| `events`        | Topic  | Tracking events (opens, clicks, bounces)        |

### Queues

| Queue                      | Routing Key              | Purpose                                  |
| -------------------------- | ------------------------ | ---------------------------------------- |
| `email.prepare.queue`      | `email.campaign.prepare` | Prepares recipients for sending          |
| `email.send.queue`         | `email.message.*`        | Sends individual emails                  |
| `email.retry.queue`        | `email.message.retry`    | Handles failed email retries             |
| `email.dlq`                | `email.*.dlq`            | Dead letter queue for permanent failures |
| `tracking.events.queue`    | `tracking.event.*`       | Processes tracking events                |
| `tracking.bulk.queue`      | `tracking.event.bulk`    | Bulk tracking updates                    |
| `stats.sync.queue`         | `stats.sync.*`           | Syncs stats from Redis to DB             |
| `campaign.lifecycle.queue` | `campaign.lifecycle.*`   | Campaign state changes                   |

### Message Flow Diagram

```
                    ┌─────────────────────┐
                    │  email.prepare.queue │
                    │  (1 msg per campaign)│
                    └──────────┬──────────┘
                               │
                    EmailPrepareWorker
                               │
                               ▼
              ┌────────────────────────────────┐
              │       email.send.queue          │
              │  (1 msg per recipient email)    │
              │     e.g., 1000 messages         │
              └────────────────┬───────────────┘
                               │
                    EmailSendWorker (prefetch: 10)
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
      [Success]           [Retryable]        [Permanent]
           │                   │                   │
           ▼                   ▼                   ▼
    Update status      email.retry.queue      email.dlq
    to SENT            (with delay)           (for analysis)
```

---

## Database Entities

### Campaign Entity

```typescript
@Entity('campaigns')
class Campaign {
  id: string; // UUID
  tenantId: string; // Multi-tenant support
  name: string; // Campaign name
  description: string; // Optional description
  type: CampaignType; // EMAIL | SMS | WHATSAPP
  status: CampaignStatus; // DRAFT | SCHEDULED | SENDING | PAUSED | SENT | CANCELLED | FAILED

  // Content
  content: EmailContent; // { subject, htmlContent, fromEmail, fromName, replyTo }
  templateId: string; // Optional template reference

  // Audience
  audienceType: string; // 'all' | 'list'
  contactListIds: string[]; // Selected contact lists

  // Scheduling
  sendImmediately: boolean;
  scheduledAt: Date; // UTC timestamp
  timezone: string; // IANA timezone for display

  // Stats
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openedCount: number;
  uniqueOpens: number;
  clickedCount: number;
  uniqueClicks: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;

  // Timestamps
  startedAt: Date;
  completedAt: Date;
  pausedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### CampaignMessage Entity

```typescript
@Entity('campaign_messages')
class CampaignMessage {
  id: string; // UUID
  campaignId: string; // Parent campaign
  contactId: string; // Recipient contact
  tenantId: string;

  // Recipient Info
  recipientEmail: string;
  recipientPhone: string;
  recipientName: string;

  // Status
  status: MessageStatus; // QUEUED | SENDING | SENT | DELIVERED | FAILED | BOUNCED

  // Tracking
  externalId: string; // SES Message ID
  renderedContent: object; // Personalized content snapshot

  // Retry Info
  retryCount: number;
  errorMessage: string;

  // Timestamps
  queuedAt: Date;
  sentAt: Date;
  deliveredAt: Date;
  failedAt: Date;
  openedAt: Date;
  clickedAt: Date;
}
```

### CampaignEvent Entity

```typescript
@Entity('campaign_events')
class CampaignEvent {
  id: string;
  campaignMessageId: string;
  campaignId: string;
  contactId: string;
  tenantId: string;

  eventType: EventType; // SENT | DELIVERED | OPENED | CLICKED | BOUNCED | COMPLAINED | UNSUBSCRIBED | FAILED

  metadata: object; // { linkUrl, userAgent, ipAddress, etc. }

  createdAt: Date;
}
```

---

## API Endpoints

### Campaign CRUD

| Method   | Endpoint                | Description                   |
| -------- | ----------------------- | ----------------------------- |
| `POST`   | `/api/v1/campaigns`     | Create new campaign           |
| `GET`    | `/api/v1/campaigns`     | List campaigns (paginated)    |
| `GET`    | `/api/v1/campaigns/:id` | Get campaign details          |
| `PUT`    | `/api/v1/campaigns/:id` | Update campaign (draft only)  |
| `DELETE` | `/api/v1/campaigns/:id` | Delete campaign (soft delete) |

### Campaign Actions

| Method | Endpoint                          | Description                 |
| ------ | --------------------------------- | --------------------------- |
| `POST` | `/api/v1/campaigns/:id/send`      | Send campaign immediately   |
| `POST` | `/api/v1/campaigns/:id/schedule`  | Schedule campaign for later |
| `POST` | `/api/v1/campaigns/:id/pause`     | Pause sending campaign      |
| `POST` | `/api/v1/campaigns/:id/resume`    | Resume paused campaign      |
| `POST` | `/api/v1/campaigns/:id/cancel`    | Cancel campaign             |
| `POST` | `/api/v1/campaigns/:id/test`      | Send test email             |
| `POST` | `/api/v1/campaigns/:id/duplicate` | Duplicate campaign          |

### Campaign Stats

| Method | Endpoint                         | Description             |
| ------ | -------------------------------- | ----------------------- |
| `GET`  | `/api/v1/campaigns/:id/stats`    | Get campaign statistics |
| `GET`  | `/api/v1/campaigns/:id/messages` | Get recipient messages  |
| `GET`  | `/api/v1/campaigns/:id/events`   | Get campaign events     |
| `GET`  | `/api/v1/campaigns/overview`     | Get campaigns overview  |

### Health & Debug

| Method | Endpoint                 | Description                  |
| ------ | ------------------------ | ---------------------------- |
| `GET`  | `/health/rabbitmq`       | Check RabbitMQ connection    |
| `GET`  | `/health/rabbitmq/debug` | Debug queue configuration    |
| `GET`  | `/health/rabbitmq/setup` | Manually trigger queue setup |
| `GET`  | `/health/aws-ses`        | Check AWS SES credentials    |

---

## Configuration

### Environment Variables

```bash
# ========================================
# RabbitMQ (Port 5673 to avoid local conflicts)
# ========================================
RABBITMQ_URL=amqp://guest:guest@localhost:5673

# ========================================
# Queue-based Email Sending
# ========================================
USE_QUEUED_SENDING=true          # Enable queue-based sending
SES_RATE_LIMIT=14                # Emails per second (AWS SES limit)

# ========================================
# AWS SES Configuration
# ========================================
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
SES_FROM_EMAIL=sender@yourdomain.com
SES_FROM_NAME=Your Company
SES_CONFIGURATION_SET=marketing-tracking

# ========================================
# Email Safety Thresholds
# ========================================
EMAIL_BOUNCE_THRESHOLD=0.05      # 5% - auto-pause if exceeded
EMAIL_COMPLAINT_THRESHOLD=0.001  # 0.1% - auto-pause if exceeded
```

### Docker Compose Services

```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - '5673:5672' # AMQP
      - '15673:15672' # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
```

---

## Workers

### EmailPrepareWorker

**Queue**: `email.prepare.queue`
**Prefetch**: 1 (one campaign at a time)

**Responsibilities**:

- Load campaign and validate status
- Count valid recipients
- Update campaign status to SENDING
- Create CampaignMessage records (streaming for memory efficiency)
- Initialize Redis counters
- Queue messages to email.send.queue in batches

```typescript
// Message format
interface EmailPrepareMessage {
  campaignId: string;
  tenantId: string;
  batchSize?: number; // Default: 100
}
```

### EmailSendWorker

**Queue**: `email.send.queue`
**Prefetch**: 10 (parallel processing)

**Responsibilities**:

- Check campaign status (skip if paused/cancelled)
- Enforce SES rate limit via Redis
- Personalize email content
- Add tracking (open pixel, click links, unsubscribe)
- Send via AWS SES
- Update message status
- Increment counters
- Check for campaign completion

```typescript
// Message format
interface EmailSendMessage {
  campaignId: string;
  tenantId: string;
  messageId: string;
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, any>;
  attempt?: number; // For retries
}
```

### EmailRetryWorker

**Queue**: `email.retry.queue`
**Prefetch**: 10

**Responsibilities**:

- Process failed messages with exponential backoff
- Re-queue to email.send.queue after delay
- Move to DLQ after max retries

```typescript
// Retry configuration
const RETRY_CONFIG = {
  EMAIL: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
};
```

---

## Logging

### Log Format

All campaign operations are logged with consistent tags for easy filtering:

```
[CAMPAIGN SEND INITIATED] ID: xxx | Name: xxx | Type: EMAIL | Mode: QUEUED | Timestamp: 2026-01-09T12:00:00.000Z
[CAMPAIGN QUEUED] ID: xxx | Publishing to email.prepare.queue | Timestamp: 2026-01-09T12:00:00.000Z
[CAMPAIGN STARTING] ID: xxx | Recipients: 1000 | StartTime: 2026-01-09T12:00:01.000Z
[EMAIL SENT] Campaign: xxx | To: user@example.com | MessageID: xxx | SES-ID: xxx | Timestamp: 2026-01-09T12:00:02.000Z
[EMAIL FAILED] Campaign: xxx | To: user@example.com | MessageID: xxx | Attempt: 1 | Error: xxx | Timestamp: 2026-01-09T12:00:02.000Z
[CAMPAIGN COMPLETED] ID: xxx | Sent: 980 | Failed: 20 | Total: 1000 | CompletedAt: 2026-01-09T12:05:00.000Z

[CAMPAIGN SCHEDULED] ID: xxx | Name: xxx | ScheduledFor: 2026-01-10T10:00:00.000Z | Timezone: America/New_York | Timestamp: 2026-01-09T12:00:00.000Z
[SCHEDULED CAMPAIGN TRIGGER] ID: xxx | Name: xxx | ScheduledFor: 2026-01-10T10:00:00.000Z | TriggerTime: 2026-01-10T10:00:01.000Z
[SCHEDULED CAMPAIGN STARTED] ID: xxx | Timestamp: 2026-01-10T10:00:01.000Z
```

### Filtering Logs

```bash
# View all campaign logs
grep "\[CAMPAIGN" logs/app.log

# View only email sends
grep "\[EMAIL SENT\]" logs/app.log

# View failures
grep "\[EMAIL FAILED\]" logs/app.log

# Track specific campaign
grep "Campaign: abc-123" logs/app.log
```

---

## Rate Limiting

### SES Rate Limiting

AWS SES has sending limits (default ~14 emails/second for new accounts). The system enforces this via Redis:

```typescript
// Redis key: ses:rate:{second}
// Value: count of emails sent in that second
// TTL: 2 seconds

async checkSESRateLimit(limit: number): Promise<boolean> {
  const key = `ses:rate:${Math.floor(Date.now() / 1000)}`;
  const current = await redis.incr(key);
  await redis.expire(key, 2);
  return current <= limit;
}
```

If rate limit is reached, message is re-queued with 100ms delay.

### Campaign-Level Rate Limiting

The system also tracks per-campaign stats in Redis:

```typescript
// Keys:
// campaign:{id}:sent     - emails sent
// campaign:{id}:failed   - emails failed
// campaign:{id}:opened   - emails opened
// campaign:{id}:clicked  - links clicked
```

---

## Error Handling & Retries

### Retryable Errors

The following errors trigger automatic retry:

- `throttling` / `rate limit`
- `timeout` / `ETIMEDOUT`
- `temporarily unavailable`
- `service unavailable`
- `connection` / `network`
- `ECONNRESET` / `ECONNREFUSED`

### Retry Strategy

```
Attempt 1: Immediate
Attempt 2: 1 second delay (with jitter)
Attempt 3: 2 seconds delay (with jitter)
Attempt 4: Move to DLQ (permanent failure)
```

### Dead Letter Queue

Failed messages after all retries go to `email.dlq`:

- TTL: 7 days
- Use for manual review and analysis
- Can be replayed after fixing issues

---

## Campaign Status Flow

```
                    ┌─────────┐
                    │  DRAFT  │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               │
   ┌───────────┐   ┌───────────┐         │
   │ SCHEDULED │   │  SENDING  │◀────────┘
   └─────┬─────┘   └─────┬─────┘    (send immediately)
         │               │
         │  (time        ├─────────────┐
         │  reached)     │             │
         │               ▼             ▼
         │         ┌───────────┐ ┌───────────┐
         └────────▶│  PAUSED   │ │   SENT    │
                   └─────┬─────┘ └───────────┘
                         │
                         │ (resume)
                         ▼
                   ┌───────────┐
                   │  SENDING  │
                   └───────────┘

  Any state ──────▶ CANCELLED (user action)
  Any state ──────▶ FAILED (system error)
```

---

## Performance Considerations

### Scaling Workers

For high-volume sending, scale horizontally:

```bash
# Run multiple worker instances
node dist/workers/email-send.worker.js --instance=1
node dist/workers/email-send.worker.js --instance=2
node dist/workers/email-send.worker.js --instance=3
```

### Batch Sizes

| Operation       | Default Batch Size | Configurable                         |
| --------------- | ------------------ | ------------------------------------ |
| Create messages | 100                | Yes (`batchSize` in prepare message) |
| Queue messages  | 100                | Yes                                  |
| DB inserts      | 500                | Via TypeORM `chunk` option           |

### Memory Efficiency

- **Cursor-based pagination** for large recipient lists
- **Streaming message creation** instead of loading all contacts
- **Campaign caching** with 30-second TTL to reduce DB queries

---

## Monitoring

### RabbitMQ Management UI

Access at: `http://localhost:15673`
Credentials: `guest` / `guest`

Monitor:

- Queue depths (messages waiting)
- Consumer count
- Message rates
- Dead letter queue size

### Health Endpoints

```bash
# Check overall health
curl http://localhost:3000/health

# Check RabbitMQ
curl http://localhost:3000/health/rabbitmq

# Check AWS SES
curl http://localhost:3000/health/aws-ses
```

### Redis Keys to Monitor

```bash
# Campaign progress
redis-cli GET campaign:{id}:progress

# SES rate limit
redis-cli GET ses:rate:{current_second}

# Campaign stats
redis-cli HGETALL campaign:{id}:stats
```

---

## Troubleshooting

### Emails Not Sending

1. **Check RabbitMQ connection**: `GET /health/rabbitmq`
2. **Verify consumers**: Check RabbitMQ management UI for active consumers
3. **Check queue depth**: Messages piling up = worker issues
4. **Verify AWS SES**: `GET /health/aws-ses`
5. **Check logs**: Filter for `[EMAIL FAILED]`

### Scheduled Campaign Not Triggering

1. **Verify campaign status**: Must be `SCHEDULED`
2. **Check scheduledAt**: Must be in UTC
3. **Check scheduler logs**: Look for `[SCHEDULED CAMPAIGN TRIGGER]`
4. **Verify cron job**: `CampaignSchedulerService` runs every minute

### High Failure Rate

1. **Check SES sending limits**: May need to request increase
2. **Verify sender identity**: Email/domain must be verified in SES
3. **Check bounce/complaint rates**: Auto-pause triggers at thresholds
4. **Review DLQ**: Analyze permanent failures

---

## File Structure

```
apps/api/src/
├── modules/
│   └── campaigns/
│       ├── campaigns.module.ts
│       ├── campaigns.controller.ts
│       ├── campaigns.service.ts
│       ├── dto/
│       │   ├── create-campaign.dto.ts
│       │   ├── update-campaign.dto.ts
│       │   └── filter-campaigns.dto.ts
│       ├── entities/
│       │   ├── campaign.entity.ts
│       │   ├── campaign-message.entity.ts
│       │   └── campaign-event.entity.ts
│       ├── services/
│       │   ├── campaign-send.service.ts
│       │   ├── campaign-scheduler.service.ts
│       │   ├── campaign-stats-sync.service.ts
│       │   └── email-tracking.service.ts
│       ├── workers/
│       │   ├── email-prepare.worker.ts
│       │   ├── email-send.worker.ts
│       │   ├── email-retry.worker.ts
│       │   └── tracking-bulk.worker.ts
│       └── controllers/
│           ├── tracking.controller.ts
│           └── ses-webhook.controller.ts
├── providers/
│   ├── queue/
│   │   ├── queue.module.ts
│   │   ├── queue.service.ts
│   │   └── queue.constants.ts
│   ├── email/
│   │   ├── email.module.ts
│   │   └── email.service.ts
│   └── redis/
│       ├── redis.module.ts
│       ├── redis-counter.service.ts
│       └── redis-cache.service.ts
└── health/
    ├── health.module.ts
    └── health.controller.ts
```

---

## Quick Reference

### Send Campaign Immediately

```bash
curl -X POST http://localhost:3000/api/v1/campaigns/{id}/send \
  -H "Authorization: Bearer {token}"
```

### Schedule Campaign

```bash
curl -X POST http://localhost:3000/api/v1/campaigns/{id}/schedule \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"scheduledAt": "2026-01-15T10:00:00Z"}'
```

### Send Test Email

```bash
curl -X POST http://localhost:3000/api/v1/campaigns/{id}/test \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### Check Campaign Progress

```bash
curl http://localhost:3000/api/v1/campaigns/{id}/stats \
  -H "Authorization: Bearer {token}"
```
