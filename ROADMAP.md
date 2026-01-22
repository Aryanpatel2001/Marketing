# ROADMAP.md

Feature roadmap and task tracking for the Marketing Platform.

---

## Current Status

| Channel         | Status       |
| --------------- | ------------ |
| Email           | Done         |
| SMS             | Done (Basic) |
| SMS Compliance  | Done         |
| WhatsApp        | Pending      |
| Payment/Billing | In Progress  |

---

## Phase 1: Payment & Billing Integration

### 1.1 Database Schema & Entities

- [x] Create `subscription-plan.entity.ts` - Static plans (Free/Starter/Growth/Pro)
- [x] Create `tenant-subscription.entity.ts` - Tenant's active subscription
- [x] Create `usage-quota.entity.ts` - Monthly quota tracking per channel
- [x] Create `wallet.entity.ts` - Tenant wallet balance
- [x] Create `wallet-transaction.entity.ts` - Transaction history
- [x] Create `invoice.entity.ts` - Invoice records
- [ ] Generate and run database migrations

### 1.2 Stripe Integration

- [x] Install Stripe SDK (`stripe` package)
- [x] Create `stripe.service.ts` - Core Stripe API wrapper
- [x] Implement customer creation (on tenant registration)
- [x] Implement subscription creation/update/cancel
- [x] Implement payment intent for wallet top-ups
- [x] Implement Stripe Checkout session creation
- [x] Create `stripe-webhook.controller.ts` - Handle Stripe events
- [x] Handle `checkout.session.completed` event
- [x] Handle `invoice.paid` event
- [x] Handle `invoice.payment_failed` event
- [x] Handle `customer.subscription.updated` event
- [x] Handle `customer.subscription.deleted` event
- [x] Implement webhook signature verification

### 1.3 Subscription Management

- [x] Create `subscription.service.ts`
- [x] Implement plan listing endpoint
- [x] Implement subscribe to plan
- [x] Implement upgrade/downgrade plan
- [x] Implement cancel subscription
- [x] Implement reactivate subscription
- [x] Implement trial period logic (14 days)
- [x] Create `subscription.controller.ts` with endpoints

### 1.4 Wallet System

- [x] Create `wallet.service.ts`
- [x] Implement wallet creation (on tenant creation)
- [x] Implement get balance endpoint
- [x] Implement top-up wallet (Stripe payment)
- [x] Implement deduct balance (on message send)
- [x] Implement refund to wallet
- [x] Implement transaction history endpoint
- [x] Implement low balance alerts
- [x] Implement auto-recharge (optional feature)
- [x] Create `wallet.controller.ts` with endpoints

### 1.5 Usage & Quota Tracking

- [x] Create `usage.service.ts`
- [x] Implement quota initialization (on subscription start)
- [x] Implement quota reset (monthly cron job)
- [x] Implement increment usage (SMS/Email/WhatsApp)
- [x] Implement check quota before send
- [x] Implement get usage stats endpoint
- [ ] Create usage exceeded notifications

### 1.6 Pricing Engine

- [x] Create `pricing.service.ts`
- [x] Define per-message rates by channel and country
- [x] Implement cost calculation for SMS (by country/segments)
- [x] Implement cost calculation for Email
- [x] Implement cost calculation for WhatsApp
- [x] Implement campaign cost estimation endpoint

### 1.7 Billing Guard (Pre-send Validation)

- [x] Create `billing.guard.ts`
- [x] Check subscription is active
- [x] Check quota availability
- [x] Check wallet balance for overage
- [x] Reserve funds before campaign send
- [x] Release/finalize funds after campaign complete
- [x] Integrate guard into campaign send flow

### 1.8 Registration Flow Update

- [x] Update registration to create Stripe customer
- [x] Add plan selection to registration flow
- [x] Redirect to Stripe Checkout for paid plans
- [x] Handle successful payment callback
- [x] Initialize wallet and quota on registration complete

### 1.9 Frontend - Billing Pages

- [x] Create `/settings/billing` page
- [x] Display current plan and usage
- [x] Plan upgrade/downgrade UI
- [x] Wallet balance and top-up button
- [x] Transaction history table
- [ ] Invoice list with download links
- [x] Payment method management
- [x] Create billing API client (`/lib/api/billing.ts`)
- [x] Create billing hooks (`/lib/hooks/use-billing.ts`)

### 1.10 Testing & Documentation

- [ ] Unit tests for billing services
- [ ] Integration tests for Stripe webhooks
- [ ] E2E tests for subscription flow
- [ ] API documentation for billing endpoints
- [ ] Update environment variables documentation

### 1.11 SMS Multi-Region Compliance (US, India, EU) ✅ COMPLETE

> **Progress Tracker:** See `SMS_COMPLIANCE_PROGRESS.md` for detailed task tracking
> **Flow Guide:** See `SMS_COMPLIANCE_FLOW_GUIDE.md` for end-to-end examples with 5 clients

#### Database Entities

- [x] Create `tenant-compliance-status.entity.ts` - Tenant compliance status
- [x] Create `dlt-template.entity.ts` - India DLT templates
- [x] Extend `sms-sender.entity.ts` with compliance fields
- [x] Extend `campaign.entity.ts` with region fields
- [x] Create and run database migration

#### US 10DLC (TCR) Compliance

- [x] Create `us-compliance.service.ts`
- [x] Implement brand registration via Twilio API
- [x] Implement campaign registration via Twilio API
- [x] Implement number-to-campaign linking
- [x] Implement send validation (brand verified, campaign approved)

#### India DLT (TRAI) Compliance

- [x] Create `india-compliance.service.ts`
- [x] Implement DLT entity registration (manual entry)
- [x] Implement template management (CRUD)
- [x] Implement template validation before send
- [x] Implement time restrictions (Promotional: 9AM-9PM only)

#### EU GDPR Compliance

- [x] Create `eu-compliance.service.ts`
- [x] Implement sender ID registration per country
- [x] Implement consent validation
- [x] Implement country-specific rules (15 EU countries)

#### Send Flow Integration

- [x] Add region detection to `sms-send.worker.ts`
- [x] Add compliance validation before send
- [x] Implement strict blocking for non-compliant sends
- [x] Add pre-send validation to `campaign-send.service.ts`

#### API Endpoints

- [x] GET `/sms/compliance/status` - Tenant compliance overview
- [x] POST `/sms/compliance/us/brand` - Register US brand
- [x] GET `/sms/compliance/us/brand/status` - Get brand status
- [x] POST `/sms/compliance/us/campaign` - Register US campaign
- [x] POST `/sms/compliance/us/link-number` - Link number to campaign
- [x] POST `/sms/compliance/india/registration` - Add DLT registration
- [x] POST `/sms/compliance/india/template` - Add DLT template
- [x] GET `/sms/compliance/india/templates` - List DLT templates
- [x] POST `/sms/compliance/eu/sender-id` - Register EU sender ID

#### Frontend

- [x] Create API client (`lib/api/sms-compliance.ts`)
- [x] Create React hooks (`lib/hooks/use-sms-compliance.ts`)
- [x] Create `/settings/sms/compliance` overview page
- [x] Create US 10DLC setup page
- [x] Create India DLT setup page with template management
- [x] Create EU sender ID registration page
- [x] Add region/template selector to campaign creation (`SmsComplianceSelector` component)

---

## Phase 2: WhatsApp Integration

### 2.1 WhatsApp Provider

- [ ] Create `whatsapp-provider.interface.ts` - Abstract provider class
- [ ] Create `meta-whatsapp.provider.ts` - Meta Business API implementation
- [ ] Implement send template message
- [ ] Implement send session message
- [ ] Implement media message support (image, document, video)
- [ ] Implement interactive messages (buttons, lists)
- [ ] Implement delivery status polling
- [ ] Handle 24-hour session window logic

### 2.2 WhatsApp Entities

- [ ] Create `whatsapp-template.entity.ts` - Message templates
- [ ] Create `whatsapp-sender.entity.ts` - Business phone numbers
- [ ] Create `whatsapp-conversation.entity.ts` - Conversation tracking
- [ ] Create `whatsapp-delivery-receipt.entity.ts`
- [ ] Generate and run migrations

### 2.3 Template Management

- [ ] Create `whatsapp-template.service.ts`
- [ ] Sync templates from Meta Business API
- [ ] Template CRUD operations
- [ ] Template variable validation
- [ ] Template preview with sample data
- [ ] Create `whatsapp-template.controller.ts`

### 2.4 WhatsApp Queue & Workers

- [ ] Add WhatsApp queue definitions to `queue.constants.ts`
- [ ] Create `whatsapp-prepare.worker.ts`
- [ ] Create `whatsapp-send.worker.ts`
- [ ] Create `whatsapp-retry.worker.ts`
- [ ] Create `whatsapp-tracking.worker.ts`
- [ ] Implement conversation fee tracking

### 2.5 WhatsApp Webhooks

- [ ] Create `whatsapp-webhook.controller.ts`
- [ ] Handle message status updates
- [ ] Handle incoming messages (replies)
- [ ] Webhook signature verification
- [ ] Create `whatsapp-tracking.service.ts`

### 2.6 WhatsApp Module

- [ ] Create `whatsapp.module.ts`
- [ ] Create `whatsapp.service.ts` - Main orchestration service
- [ ] Integrate with billing (cost per message + conversation fee)
- [ ] Register module in `app.module.ts`

### 2.7 Frontend - WhatsApp

- [ ] Create WhatsApp campaign creation page
- [ ] Template selector component
- [ ] Template variable mapping UI
- [ ] WhatsApp preview component
- [ ] WhatsApp sender management page
- [ ] WhatsApp analytics dashboard

---

## Phase 3: Analytics & Reporting

### 3.1 Analytics Engine

- [ ] Create `analytics.service.ts`
- [ ] Campaign performance metrics aggregation
- [ ] Real-time stats with Redis
- [ ] Historical data queries
- [ ] Export to CSV/PDF

### 3.2 Dashboard Widgets

- [ ] Messages sent (today/week/month)
- [ ] Delivery rate by channel
- [ ] Cost breakdown chart
- [ ] Top performing campaigns
- [ ] Contact growth chart

### 3.3 Campaign Reports

- [ ] Detailed campaign report page
- [ ] Delivery funnel visualization
- [ ] Geographic distribution
- [ ] Device/carrier breakdown (SMS)
- [ ] Engagement timeline

---

## Phase 4: Automation & Workflows

### 4.1 Automation Engine

- [ ] Create `automation.entity.ts` - Workflow definitions
- [ ] Create `automation-step.entity.ts` - Workflow steps
- [ ] Create `automation-execution.entity.ts` - Execution tracking
- [ ] Create `automation.service.ts`

### 4.2 Triggers

- [ ] Contact created trigger
- [ ] Contact updated trigger
- [ ] Tag added trigger
- [ ] Form submitted trigger
- [ ] Date-based trigger (birthday, anniversary)
- [ ] Webhook trigger

### 4.3 Actions

- [ ] Send Email action
- [ ] Send SMS action
- [ ] Send WhatsApp action
- [ ] Wait/Delay action
- [ ] Add tag action
- [ ] Update contact action
- [ ] Webhook action

### 4.4 Workflow Builder

- [ ] Visual workflow editor (React Flow)
- [ ] Drag-and-drop steps
- [ ] Conditional branching
- [ ] Workflow templates

---

## Phase 5: Advanced Features

### 5.1 A/B Testing

- [ ] A/B test entity and service
- [ ] Variant creation (subject, content, send time)
- [ ] Traffic splitting logic
- [ ] Statistical significance calculation
- [ ] Winner auto-selection

### 5.2 Advanced Segmentation

- [ ] Segment builder UI
- [ ] Dynamic segments (auto-update)
- [ ] Behavioral conditions (opened, clicked)
- [ ] RFM segmentation
- [ ] Segment size estimation

### 5.3 API & Integrations

- [ ] Public API with API keys
- [ ] Rate limiting per plan
- [ ] Webhook subscriptions (outgoing)
- [ ] Zapier integration
- [ ] HubSpot integration
- [ ] Shopify integration

### 5.4 Compliance & Security

- [ ] GDPR compliance tools
- [ ] Opt-out management
- [ ] Data export (user request)
- [ ] Data deletion (user request)
- [ ] Audit logs
- [ ] Two-factor authentication

---

## Environment Variables Required

### Stripe (Phase 1)

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID_STARTER=price_xxx
STRIPE_PRICE_ID_GROWTH=price_xxx
STRIPE_PRICE_ID_PRO=price_xxx
```

### WhatsApp (Phase 2)

```env
META_WHATSAPP_ACCESS_TOKEN=xxx
META_WHATSAPP_BUSINESS_ID=xxx
META_WHATSAPP_PHONE_NUMBER_ID=xxx
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN=xxx
```

### SMS Compliance (Phase 1.11)

```env
# US 10DLC
TWILIO_10DLC_ENABLED=true

# India DLT
DLT_ENABLED=true
DLT_PROMOTIONAL_START_HOUR=9
DLT_PROMOTIONAL_END_HOUR=21

# EU
EU_COMPLIANCE_ENABLED=true

# General
SMS_COMPLIANCE_STRICT_MODE=true
```

---

## Progress Summary

| Phase | Feature                      | Progress |
| ----- | ---------------------------- | -------- |
| 1     | Payment & Billing            | 95%      |
| 1.11  | SMS Compliance (US/India/EU) | 100% ✅  |
| 2     | WhatsApp Integration         | 0%       |
| 3     | Analytics & Reporting        | 0%       |
| 4     | Automation & Workflows       | 0%       |
| 5     | Advanced Features            | 0%       |

---

Last Updated: 2026-01-18
