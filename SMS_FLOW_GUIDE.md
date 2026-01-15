# SMS Flow Guide

Complete step-by-step guide for the SMS system from sender setup to message delivery.

## Table of Contents

1. [Trial Account Setup](#trial-account-setup) _(Start Here for Development)_
2. [Architecture Overview](#architecture-overview)
3. [Sender Types](#sender-types)
4. [Complete Flow Diagram](#complete-flow-diagram)
5. [Step-by-Step Example](#step-by-step-example)
6. [API Reference](#api-reference)
7. [Database Schema](#database-schema)
8. [Queue Processing](#queue-processing)

---

## Trial Account Setup

> **For Development/Testing with Twilio Trial Account**

When using a Twilio trial account, you cannot purchase new phone numbers through the API. Instead, use the trial number assigned to your account.

### Step 1: Configure Environment Variables

```bash
# apps/api/.env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio trial number
```

### Step 2: Register Your Trial Number

**Option A: Auto-Setup (Recommended)**

Call the setup-trial endpoint to automatically register the number from your environment:

```bash
# API Request
POST /api/sms/senders/setup-trial
Authorization: Bearer <your-jwt-token>

# Response
{
  "id": "uuid-sender-123",
  "type": "dedicated_number",
  "phoneNumber": "+1234567890",
  "friendlyName": "Twilio Trial Number",
  "status": "active",
  "isDefault": true,
  ...
}
```

**Option B: Manual Registration**

Add your trial number manually:

```bash
# API Request
POST /api/sms/senders/add-existing
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "friendlyName": "My Trial Number"
}
```

### Step 3: Verify Recipient Numbers (Trial Limitation)

⚠️ **Important**: Twilio trial accounts can only send SMS to **verified phone numbers**.

1. Go to [Twilio Console → Verified Caller IDs](https://console.twilio.com/us1/develop/phone-numbers/manage/verified)
2. Add and verify the phone numbers you want to send SMS to
3. Only these numbers will receive your test messages

### Trial Account Limitations

| Feature              | Trial Account            | Paid Account |
| -------------------- | ------------------------ | ------------ |
| Purchase new numbers | ❌ No                    | ✅ Yes       |
| Send to any number   | ❌ Only verified         | ✅ Yes       |
| Message prefix       | "Sent from Twilio trial" | None         |
| Outbound SMS         | ✅ Yes                   | ✅ Yes       |
| Delivery webhooks    | ✅ Yes                   | ✅ Yes       |

### Quick Test

Once your trial number is registered, test the flow:

```bash
# 1. Check your senders list
GET /api/sms/senders

# 2. Create a test campaign with your verified number as recipient
POST /api/campaigns
{
  "name": "Test Campaign",
  "type": "SMS",
  "content": { "message": "Hello from the trial!" }
}

# 3. Send the campaign
POST /api/campaigns/{id}/send
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SMS SYSTEM ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Next.js │───▶│  NestJS  │───▶│ RabbitMQ │───▶│  Workers │              │
│  │ Frontend │    │   API    │    │  Queues  │    │          │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │               │                     │
│       │               │               │               ▼                     │
│       │               │               │         ┌──────────┐               │
│       │               │               │         │  Twilio  │               │
│       │               │               │         │   API    │               │
│       │               │               │         └──────────┘               │
│       │               │               │               │                     │
│       │               ▼               │               │                     │
│       │         ┌──────────┐         │               │                     │
│       │         │PostgreSQL│◀────────┴───────────────┘                     │
│       │         │   + Redis│         Webhooks                              │
│       │         └──────────┘                                               │
│       │               ▲                                                     │
│       └───────────────┘                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Sender Types

| Type                 | Description                        | Cost       | Capabilities                   | Plan Availability |
| -------------------- | ---------------------------------- | ---------- | ------------------------------ | ----------------- |
| **Dedicated Number** | Local phone number                 | $1-2/month | SMS + MMS + Voice              | All plans         |
| **Toll-Free Number** | 1-800 style number                 | $2/month   | SMS + MMS + Voice (US/CA only) | Pro+ plans        |
| **Sender ID**        | Alphanumeric tag (e.g., "MYBRAND") | Free       | SMS only, one-way              | Enterprise only   |

### Plan Limits

| Plan       | Dedicated | Toll-Free | Sender IDs |
| ---------- | --------- | --------- | ---------- |
| Free       | 1         | 0         | 0          |
| Starter    | 2         | 0         | 0          |
| Pro        | 5         | 2         | 0          |
| Enterprise | Unlimited | Unlimited | Unlimited  |

---

## Complete Flow Diagram

```
                           COMPLETE SMS CAMPAIGN FLOW
                           ==========================

┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: SENDER SETUP (One-time)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User → Search Numbers → Select Number → Purchase → Twilio Provision       │
│                                                                             │
│  POST /api/sms/senders/search?country=US&type=local                        │
│  POST /api/sms/senders/purchase { phoneNumber: "+1234567890" }             │
│                                                                             │
│  Result: SmsSender record created with status=ACTIVE                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: CAMPAIGN CREATION                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User → Create Campaign → Select Sender → Add Recipients → Set Message     │
│                                                                             │
│  POST /api/campaigns                                                        │
│  {                                                                          │
│    "name": "January Promo",                                                 │
│    "type": "SMS",                                                           │
│    "senderId": "sender-uuid",                                               │
│    "segmentIds": ["segment-uuid"],                                          │
│    "content": { "body": "Hi {{firstName}}, 20% off today!" }                │
│  }                                                                          │
│                                                                             │
│  Result: Campaign record created with status=DRAFT                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: CAMPAIGN SEND TRIGGER                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User clicks "Send Now" or Scheduler triggers at scheduled time            │
│                                                                             │
│  POST /api/campaigns/:id/send                                               │
│                                                                             │
│  CampaignSendService:                                                       │
│  1. Validates campaign (status, sender active, balance)                     │
│  2. Updates campaign status → QUEUED                                        │
│  3. Publishes to RabbitMQ: sms.campaign.prepare                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: PREPARE WORKER (sms-prepare.worker.ts)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Consumes: sms.campaign.prepare queue                                       │
│                                                                             │
│  For each recipient in campaign segments:                                   │
│  1. Creates CampaignMessage record (status=PENDING)                         │
│  2. Personalizes message content with contact data                          │
│  3. Publishes to: sms.message.send queue                                    │
│                                                                             │
│  Example: 1000 recipients → 1000 CampaignMessage records                    │
│           → 1000 messages in sms.message.send queue                         │
│                                                                             │
│  Updates campaign status → SENDING                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: SEND WORKER (sms-send.worker.ts)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Consumes: sms.message.send queue (parallel processing)                     │
│                                                                             │
│  For each message:                                                          │
│  1. Gets tenant sender from cache/DB (SenderService.getDefaultSender)       │
│  2. Calls TwilioProvider.sendSms(from, to, body)                            │
│  3. On success: Update CampaignMessage status → SENT                        │
│  4. On failure: Publish to sms.message.retry queue                          │
│                                                                             │
│  Twilio Response:                                                           │
│  { sid: "SMxxxxx", status: "queued", ... }                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ SUCCESS PATH                    │  │ FAILURE PATH                    │
├─────────────────────────────────┤  ├─────────────────────────────────┤
│                                 │  │                                 │
│ Message sent to Twilio          │  │ RETRY WORKER                    │
│ Status: SENT                    │  │ (sms-retry.worker.ts)           │
│                                 │  │                                 │
│ Waiting for delivery webhook... │  │ Exponential backoff:            │
│                                 │  │ Attempt 1: 1 min delay          │
│                                 │  │ Attempt 2: 5 min delay          │
│                                 │  │ Attempt 3: 15 min delay         │
│                                 │  │                                 │
│                                 │  │ Max 3 retries → FAILED          │
│                                 │  │                                 │
└─────────────────────────────────┘  └─────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: WEBHOOK PROCESSING (sms-webhook.controller.ts)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Twilio calls: POST /api/webhooks/sms/status                                │
│                                                                             │
│  Payload:                                                                   │
│  {                                                                          │
│    "MessageSid": "SMxxxxx",                                                 │
│    "MessageStatus": "delivered",                                            │
│    "To": "+1234567890",                                                     │
│    "ErrorCode": null                                                        │
│  }                                                                          │
│                                                                             │
│  SmsTrackingService:                                                        │
│  1. Finds CampaignMessage by externalId (MessageSid)                        │
│  2. Updates status: SENT → DELIVERED                                        │
│  3. Updates campaign metrics                                                │
│  4. Publishes to tracking queue for analytics                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 7: CAMPAIGN COMPLETION                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  When all messages processed:                                               │
│                                                                             │
│  Campaign status → COMPLETED                                                │
│                                                                             │
│  Final metrics:                                                             │
│  - totalRecipients: 1000                                                    │
│  - delivered: 950                                                           │
│  - failed: 30                                                               │
│  - undelivered: 20                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Example

### Real-World Scenario

**Business**: "Coffee Shop Co" wants to send a promotional SMS to 500 customers.

---

### Step 1: Purchase a Phone Number

**Frontend Action**: User navigates to Settings → SMS → Senders → "Purchase Number"

**API Request**:

```http
GET /api/sms/senders/search?country=US&type=local&areaCode=415
Authorization: Bearer <jwt-token>
```

**API Response**:

```json
{
  "numbers": [
    {
      "phoneNumber": "+14155551234",
      "friendlyName": "(415) 555-1234",
      "locality": "San Francisco",
      "region": "CA",
      "capabilities": {
        "sms": true,
        "mms": true,
        "voice": true
      },
      "price": "1.00",
      "currency": "USD"
    }
  ]
}
```

**User selects the number and clicks "Purchase"**

**API Request**:

```http
POST /api/sms/senders/purchase
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "phoneNumber": "+14155551234",
  "friendlyName": "Main Marketing Line"
}
```

**Backend Process** (`sender.service.ts`):

```typescript
// 1. Check plan limits
const limits = this.getPlanLimits(tenant.subscriptionPlan);
const currentCount = await this.senderRepository.count({
  where: { tenantId, type: SenderType.DEDICATED_NUMBER },
});
if (currentCount >= limits.dedicatedNumbers) {
  throw new BadRequestException('Plan limit reached');
}

// 2. Purchase from Twilio
const twilioNumber = await this.twilioClient.incomingPhoneNumbers.create({
  phoneNumber: '+14155551234',
  smsUrl: 'https://api.yourapp.com/webhooks/sms/inbound',
  statusCallback: 'https://api.yourapp.com/webhooks/sms/status',
});

// 3. Create database record
const sender = this.senderRepository.create({
  tenantId,
  type: SenderType.DEDICATED_NUMBER,
  phoneNumber: '+14155551234',
  twilioSid: twilioNumber.sid,
  status: SenderStatus.ACTIVE,
  capabilities: { sms: true, mms: true, voice: true },
  monthlyPrice: 1.0,
});
await this.senderRepository.save(sender);
```

**Database Record Created**:

```sql
INSERT INTO sms_senders (
  id, tenant_id, type, phone_number, twilio_sid,
  status, capabilities, monthly_price, renews_at
) VALUES (
  'uuid-sender-123',
  'uuid-tenant-456',
  'dedicated_number',
  '+14155551234',
  'PNxxxxxxxxxxxxx',
  'active',
  '{"sms": true, "mms": true, "voice": true}',
  1.00,
  '2024-02-15'
);
```

---

### Step 2: Create the Campaign

**Frontend Action**: User navigates to Campaigns → New Campaign → SMS

**User fills in**:

- Name: "January Coffee Promo"
- Sender: "(415) 555-1234"
- Segments: "All Customers"
- Message: "Hi {{firstName}}, enjoy 20% off your next coffee! Show this text. Reply STOP to opt out."

**API Request**:

```http
POST /api/campaigns
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "January Coffee Promo",
  "type": "SMS",
  "senderId": "uuid-sender-123",
  "segmentIds": ["uuid-segment-all-customers"],
  "content": {
    "body": "Hi {{firstName}}, enjoy 20% off your next coffee! Show this text. Reply STOP to opt out."
  },
  "scheduledAt": null
}
```

**Database Record Created**:

```sql
INSERT INTO campaigns (
  id, tenant_id, name, type, sender_id,
  segment_ids, content, status, created_at
) VALUES (
  'uuid-campaign-789',
  'uuid-tenant-456',
  'January Coffee Promo',
  'SMS',
  'uuid-sender-123',
  '["uuid-segment-all-customers"]',
  '{"body": "Hi {{firstName}}, enjoy 20% off..."}',
  'draft',
  '2024-01-15 10:00:00'
);
```

---

### Step 3: Send the Campaign

**Frontend Action**: User clicks "Send Now"

**API Request**:

```http
POST /api/campaigns/uuid-campaign-789/send
Authorization: Bearer <jwt-token>
```

**Backend Process** (`campaign-send.service.ts`):

```typescript
async sendCampaign(campaignId: string, tenantId: string) {
  // 1. Load and validate campaign
  const campaign = await this.campaignRepository.findOne({
    where: { id: campaignId, tenantId },
    relations: ['sender'],
  });

  // 2. Validate sender is active
  if (campaign.sender.status !== SenderStatus.ACTIVE) {
    throw new BadRequestException('Sender is not active');
  }

  // 3. Check SMS balance
  const balance = await this.billingService.getSmsBalance(tenantId);
  const recipientCount = await this.getRecipientCount(campaign.segmentIds);
  if (balance < recipientCount) {
    throw new BadRequestException('Insufficient SMS credits');
  }

  // 4. Update status to QUEUED
  await this.campaignRepository.update(campaignId, { status: 'queued' });

  // 5. Publish to prepare queue
  await this.queueService.publish(
    SMS_EXCHANGES.CAMPAIGN,
    SMS_ROUTING_KEYS.PREPARE,
    {
      campaignId,
      tenantId,
      type: 'SMS',
    }
  );

  return { message: 'Campaign queued for sending' };
}
```

**RabbitMQ Message Published**:

```
Exchange: sms.campaign
Routing Key: sms.campaign.prepare
Message: { campaignId: "uuid-campaign-789", tenantId: "uuid-tenant-456", type: "SMS" }
```

---

### Step 4: Prepare Worker Processes Campaign

**Worker** (`sms-prepare.worker.ts`) picks up the message:

```typescript
@RabbitSubscribe({
  exchange: SMS_EXCHANGES.CAMPAIGN,
  routingKey: SMS_ROUTING_KEYS.PREPARE,
  queue: SMS_QUEUES.PREPARE,
})
async handlePrepare(payload: PrepareCampaignPayload) {
  const { campaignId, tenantId } = payload;

  // 1. Load campaign with content
  const campaign = await this.campaignRepository.findOne({
    where: { id: campaignId },
    relations: ['sender'],
  });

  // 2. Get all recipients from segments
  const recipients = await this.contactService.getContactsBySegments(
    campaign.segmentIds,
    tenantId
  );

  // 3. Update campaign status
  await this.campaignRepository.update(campaignId, {
    status: 'sending',
    totalRecipients: recipients.length,
  });

  // 4. Create message records and queue for sending
  for (const contact of recipients) {
    // Personalize message
    const personalizedBody = this.personalizeMessage(
      campaign.content.body,
      contact
    );
    // "Hi John, enjoy 20% off your next coffee!..."

    // Create message record
    const message = await this.messageRepository.save({
      campaignId,
      tenantId,
      contactId: contact.id,
      channel: 'SMS',
      recipient: contact.phone,
      content: { body: personalizedBody },
      status: 'pending',
    });

    // Queue for sending
    await this.queueService.publish(
      SMS_EXCHANGES.MESSAGE,
      SMS_ROUTING_KEYS.SEND,
      {
        messageId: message.id,
        tenantId,
        to: contact.phone,
        body: personalizedBody,
        senderId: campaign.senderId,
      }
    );
  }
}
```

**Database Records Created** (500 records):

```sql
INSERT INTO campaign_messages (id, campaign_id, tenant_id, contact_id, channel, recipient, content, status)
VALUES
  ('msg-001', 'uuid-campaign-789', 'uuid-tenant-456', 'contact-1', 'SMS', '+14155550001', '{"body": "Hi John..."}', 'pending'),
  ('msg-002', 'uuid-campaign-789', 'uuid-tenant-456', 'contact-2', 'SMS', '+14155550002', '{"body": "Hi Sarah..."}', 'pending'),
  -- ... 498 more records
;
```

---

### Step 5: Send Worker Delivers Messages

**Worker** (`sms-send.worker.ts`) processes each message:

```typescript
@RabbitSubscribe({
  exchange: SMS_EXCHANGES.MESSAGE,
  routingKey: SMS_ROUTING_KEYS.SEND,
  queue: SMS_QUEUES.SEND,
})
async handleSend(payload: SendMessagePayload) {
  const { messageId, tenantId, to, body, senderId } = payload;

  try {
    // 1. Get sender (cached for 60 seconds)
    const sender = await this.getSenderCached(senderId, tenantId);

    // 2. Send via Twilio
    const result = await this.twilioProvider.sendSms({
      from: sender.phoneNumber,  // +14155551234
      to: to,                     // +14155550001
      body: body,                 // "Hi John, enjoy 20% off..."
      statusCallback: `${this.webhookBaseUrl}/webhooks/sms/status`,
    });

    // 3. Update message record
    await this.messageRepository.update(messageId, {
      status: 'sent',
      externalId: result.sid,  // SMxxxxxxxxxxxxxxx
      sentAt: new Date(),
    });

    // 4. Update sender metrics
    await this.senderService.incrementMessageCount(senderId);

  } catch (error) {
    // 5. Queue for retry
    await this.queueService.publish(
      SMS_EXCHANGES.MESSAGE,
      SMS_ROUTING_KEYS.RETRY,
      {
        ...payload,
        attempt: (payload.attempt || 0) + 1,
        error: error.message,
      }
    );

    await this.messageRepository.update(messageId, {
      status: 'failed',
      errorMessage: error.message,
    });
  }
}
```

**Twilio API Call**:

```http
POST https://api.twilio.com/2010-04-01/Accounts/ACXXXXXXX/Messages.json
Authorization: Basic base64(AccountSid:AuthToken)

From=+14155551234
To=+14155550001
Body=Hi John, enjoy 20% off your next coffee! Show this text. Reply STOP to opt out.
StatusCallback=https://api.yourapp.com/webhooks/sms/status
```

**Twilio Response**:

```json
{
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "to": "+14155550001",
  "from": "+14155551234",
  "body": "Hi John, enjoy 20% off...",
  "date_created": "2024-01-15T10:05:00Z"
}
```

---

### Step 6: Twilio Sends Delivery Webhook

Twilio calls your webhook when message status changes:

**Webhook Request** (from Twilio):

```http
POST /api/webhooks/sms/status
Content-Type: application/x-www-form-urlencoded

MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MessageStatus=delivered
To=+14155550001
From=+14155551234
ApiVersion=2010-04-01
```

**Controller** (`sms-webhook.controller.ts`):

```typescript
@Post('status')
async handleStatusWebhook(@Body() payload: TwilioStatusWebhook) {
  await this.trackingService.updateMessageStatus({
    externalId: payload.MessageSid,
    status: this.mapTwilioStatus(payload.MessageStatus),
    errorCode: payload.ErrorCode,
    deliveredAt: payload.MessageStatus === 'delivered' ? new Date() : null,
  });

  return ''; // Twilio expects empty 200 response
}
```

**Tracking Service** (`sms-tracking.service.ts`):

```typescript
async updateMessageStatus(data: UpdateStatusDto) {
  // 1. Find message by external ID
  const message = await this.messageRepository.findOne({
    where: { externalId: data.externalId },
  });

  // 2. Update message status
  await this.messageRepository.update(message.id, {
    status: data.status,  // 'delivered'
    deliveredAt: data.deliveredAt,
    errorCode: data.errorCode,
  });

  // 3. Update campaign metrics
  await this.campaignRepository.increment(
    { id: message.campaignId },
    'deliveredCount',
    1
  );

  // 4. Queue for analytics processing
  await this.queueService.publish(
    SMS_EXCHANGES.TRACKING,
    SMS_ROUTING_KEYS.STATUS_UPDATE,
    {
      messageId: message.id,
      campaignId: message.campaignId,
      status: data.status,
    }
  );
}
```

---

### Step 7: Campaign Completion

After all 500 messages are processed, the campaign metrics show:

```sql
SELECT
  id,
  name,
  status,
  total_recipients,
  (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'delivered') as delivered,
  (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'failed') as failed,
  (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id AND status = 'undelivered') as undelivered
FROM campaigns c
WHERE id = 'uuid-campaign-789';
```

**Result**:

```
id                  | uuid-campaign-789
name                | January Coffee Promo
status              | completed
total_recipients    | 500
delivered           | 485
failed              | 10
undelivered         | 5
```

---

## API Reference

### Sender Management

| Method | Endpoint                             | Description                          |
| ------ | ------------------------------------ | ------------------------------------ |
| GET    | `/api/sms/senders`                   | List tenant's senders                |
| GET    | `/api/sms/senders/available-numbers` | Search available numbers             |
| POST   | `/api/sms/senders/purchase-number`   | Purchase a phone number              |
| POST   | `/api/sms/senders/add-existing`      | Add existing number (trial accounts) |
| POST   | `/api/sms/senders/setup-trial`       | Auto-setup trial number from env     |
| POST   | `/api/sms/senders/sender-id`         | Register a Sender ID                 |
| DELETE | `/api/sms/senders/:id`               | Release a sender                     |
| GET    | `/api/sms/senders/limits`            | Get plan limits                      |
| GET    | `/api/sms/senders/default`           | Get default sender                   |
| POST   | `/api/sms/senders/:id/default`       | Set sender as default                |
| PATCH  | `/api/sms/senders/:id`               | Update sender                        |
| POST   | `/api/sms/validate-phone`            | Validate phone number                |
| POST   | `/api/sms/calculate-segments`        | Calculate SMS segments               |

### Campaign Management

| Method | Endpoint                      | Description          |
| ------ | ----------------------------- | -------------------- |
| POST   | `/api/campaigns`              | Create campaign      |
| GET    | `/api/campaigns/:id`          | Get campaign details |
| POST   | `/api/campaigns/:id/send`     | Send campaign        |
| GET    | `/api/campaigns/:id/messages` | Get message list     |

### Webhooks

| Method | Endpoint                    | Description            |
| ------ | --------------------------- | ---------------------- |
| POST   | `/api/webhooks/sms/status`  | Twilio status callback |
| POST   | `/api/webhooks/sms/inbound` | Twilio inbound SMS     |

---

## Database Schema

### sms_senders

```sql
CREATE TABLE sms_senders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type VARCHAR(20) NOT NULL, -- dedicated_number, toll_free, sender_id
  phone_number VARCHAR(20),
  twilio_sid VARCHAR(50),
  sender_id VARCHAR(11),
  sender_id_countries TEXT[], -- For sender IDs
  friendly_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  capabilities JSONB,
  monthly_price DECIMAL(10,2),
  messages_sent INTEGER DEFAULT 0,
  renews_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP -- Soft delete
);
```

### campaign_messages

```sql
CREATE TABLE campaign_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  contact_id UUID REFERENCES contacts(id),
  channel VARCHAR(20) NOT NULL, -- SMS, EMAIL, WHATSAPP
  recipient VARCHAR(100) NOT NULL,
  content JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  external_id VARCHAR(100), -- Twilio MessageSid
  error_message TEXT,
  error_code VARCHAR(20),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_external_id ON campaign_messages(external_id);
CREATE INDEX idx_messages_campaign_status ON campaign_messages(campaign_id, status);
```

---

## Queue Processing

### Queue Definitions

```typescript
// apps/api/src/providers/queue/queue.constants.ts

export const SMS_EXCHANGES = {
  CAMPAIGN: 'sms.campaign',
  MESSAGE: 'sms.message',
  TRACKING: 'sms.tracking',
};

export const SMS_ROUTING_KEYS = {
  PREPARE: 'sms.campaign.prepare',
  SEND: 'sms.message.send',
  RETRY: 'sms.message.retry',
  STATUS_UPDATE: 'sms.tracking.status',
};

export const SMS_QUEUES = {
  PREPARE: 'sms.prepare.queue',
  SEND: 'sms.send.queue',
  RETRY: 'sms.retry.queue',
  TRACKING: 'sms.tracking.queue',
};
```

### Message Flow

```
Campaign Send Request
        │
        ▼
┌───────────────────┐
│ sms.campaign      │ Exchange (topic)
│ .prepare          │ Routing Key
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ sms.prepare.queue │ Queue
│ (PrepareWorker)   │
└───────┬───────────┘
        │ Creates N messages
        ▼
┌───────────────────┐
│ sms.message       │ Exchange (topic)
│ .send             │ Routing Key
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ sms.send.queue    │ Queue (N consumers)
│ (SendWorker)      │
└───────┬───────────┘
        │
   ┌────┴────┐
   │         │
Success    Failure
   │         │
   ▼         ▼
Webhook   ┌───────────────────┐
          │ sms.retry.queue   │
          │ (RetryWorker)     │
          └───────────────────┘
```

---

## Status Lifecycle

### Message Status Flow

```
PENDING → SENT → DELIVERED
              ↘ UNDELIVERED
              ↘ FAILED

PENDING: Message created, waiting to be sent
SENT: Message accepted by Twilio
DELIVERED: Confirmed delivered to recipient
UNDELIVERED: Carrier could not deliver
FAILED: Error during sending (after retries)
```

### Campaign Status Flow

```
DRAFT → QUEUED → SENDING → COMPLETED
                        ↘ PARTIALLY_COMPLETED
                        ↘ FAILED

DRAFT: Campaign created, not sent
QUEUED: Send requested, waiting for worker
SENDING: Prepare worker processing recipients
COMPLETED: All messages processed
PARTIALLY_COMPLETED: Some messages failed
FAILED: Critical error during send
```

---

## Troubleshooting

### Common Issues

1. **Message stuck in PENDING**: Check RabbitMQ connection and worker status
2. **High failure rate**: Check Twilio account balance and sender verification
3. **Webhook not updating**: Verify webhook URL is accessible and Twilio signature validation
4. **Slow sending**: Scale up send workers or implement batch sending

### Monitoring Queries

```sql
-- Messages by status for a campaign
SELECT status, COUNT(*)
FROM campaign_messages
WHERE campaign_id = 'xxx'
GROUP BY status;

-- Failed messages with errors
SELECT recipient, error_message, error_code
FROM campaign_messages
WHERE campaign_id = 'xxx' AND status = 'failed';

-- Sender usage this month
SELECT phone_number, messages_sent
FROM sms_senders
WHERE tenant_id = 'xxx';
```

Contents:

1. Architecture Overview - Visual diagram showing the complete system architecture
2. Sender Types - Table of all 3 sender types with costs and capabilities
3. Complete Flow Diagram - All 7 phases from sender setup to campaign completion
4. Step-by-Step Real Example - "Coffee Shop Co" sending 500 promotional SMS messages:


    - Step 1: Purchasing a phone number (+14155551234)
    - Step 2: Creating the campaign with personalization
    - Step 3: Triggering the send
    - Step 4: Prepare worker creating message records
    - Step 5: Send worker delivering via Twilio
    - Step 6: Webhook processing delivery status
    - Step 7: Campaign completion with metrics

5. API Reference - Complete table of all endpoints
6. Database Schema - SQL for sms_senders and campaign_messages tables
7. Queue Processing - RabbitMQ exchanges, routing keys, and message flow
8. Status Lifecycle - Message and campaign status state diagrams
9. Troubleshooting - Common issues and monitoring queries
