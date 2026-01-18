# Payment & Billing System Documentation

## Overview

This document covers the complete payment and billing system for the Marketing Automation Platform. The system supports subscription-based billing, pay-as-you-go wallet, usage tracking, and full Stripe integration.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Subscription Management](#subscription-management)
3. [Wallet & Pay-As-You-Go](#wallet--pay-as-you-go)
4. [Usage Tracking & Quotas](#usage-tracking--quotas)
5. [Pricing System](#pricing-system)
6. [Stripe Integration](#stripe-integration)
7. [Webhook Handling](#webhook-handling)
8. [Onboarding Flow](#onboarding-flow)
9. [Invoices](#invoices)
10. [Guards & Protection](#guards--protection)
11. [Frontend Implementation](#frontend-implementation)
12. [API Reference](#api-reference)
13. [Configuration](#configuration)
14. [Database Schema](#database-schema)

---

## Architecture

### Backend Stack

- **Framework**: NestJS
- **Database**: PostgreSQL with TypeORM
- **Payment Provider**: Stripe
- **Event System**: NestJS EventEmitter2
- **Cron Jobs**: @nestjs/schedule

### File Structure

```
Backend (apps/api/src/modules/billing/)
├── billing.module.ts
├── entities/
│   ├── subscription-plan.entity.ts
│   ├── tenant-subscription.entity.ts
│   ├── usage-quota.entity.ts
│   ├── wallet.entity.ts
│   ├── wallet-transaction.entity.ts
│   └── invoice.entity.ts
├── services/
│   ├── stripe.service.ts
│   ├── subscription.service.ts
│   ├── wallet.service.ts
│   ├── usage.service.ts
│   └── pricing.service.ts
├── controllers/
│   ├── subscription.controller.ts
│   ├── wallet.controller.ts
│   ├── usage.controller.ts
│   └── stripe-webhook.controller.ts
├── guards/
│   └── billing.guard.ts
├── listeners/
│   └── usage-notification.listener.ts
└── dto/
    ├── subscription.dto.ts
    ├── wallet.dto.ts
    └── usage.dto.ts

Frontend (apps/web/src/)
├── app/(dashboard)/
│   ├── settings/billing/page.tsx
│   └── onboarding/
│       ├── select-plan/page.tsx
│       └── complete/page.tsx
└── lib/
    ├── api/billing.ts
    └── hooks/use-billing.ts
```

---

## Subscription Management

### Plan Tiers

| Tier       | Price  | SMS/mo    | Email/mo  | Contacts  | Features           |
| ---------- | ------ | --------- | --------- | --------- | ------------------ |
| FREE       | $0     | 100       | 1,000     | 500       | Basic              |
| STARTER    | $29    | 1,000     | 25,000    | 5,000     | API Access         |
| GROWTH     | $79    | 10,000    | 100,000   | 25,000    | + Analytics        |
| PRO        | $199   | 50,000    | 500,000   | 100,000   | + Priority Support |
| ENTERPRISE | Custom | Unlimited | Unlimited | Unlimited | + Custom Features  |

### Plan Features

```typescript
interface PlanFeatures {
  apiAccess: boolean;
  customDomain: boolean;
  prioritySupport: boolean;
  advancedAnalytics: boolean;
  webhooks: boolean;
  automations: boolean;
  abTesting: boolean;
  dedicatedIp: boolean;
  whiteLabel: boolean;
}
```

### Subscription Status

```typescript
enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  PAUSED = 'paused',
}
```

### Subscription Lifecycle

```
Registration
    ↓
Onboarding Plan Selection
    ↓
Stripe Checkout (for paid plans)
    ↓
Trial Period (14 days)
    ↓
Active Subscription
    ↓
[Cancel] → Cancel at Period End → Cancelled
    ↓
[Reactivate] → Active
```

### Key Operations

#### Create Subscription

```typescript
// Called during onboarding or plan upgrade
await subscriptionService.createSubscription(tenantId, stripeCustomerId, {
  planTier: PlanTier.STARTER,
});
```

#### Change Plan

```typescript
// Proration applied by default
await subscriptionService.updateSubscription(tenantId, {
  planTier: PlanTier.GROWTH,
  prorate: true,
});
```

#### Cancel Subscription

```typescript
// Cancel at end of billing period
await subscriptionService.cancelSubscription(tenantId, {
  cancelAtPeriodEnd: true,
  reason: 'Too expensive',
});

// Cancel immediately
await subscriptionService.cancelSubscription(tenantId, {
  cancelAtPeriodEnd: false,
});
```

#### Reactivate Subscription

```typescript
// Before period ends
await subscriptionService.reactivateSubscription(tenantId);
```

---

## Wallet & Pay-As-You-Go

### Wallet Entity

Each tenant has one wallet for pay-as-you-go messaging beyond quotas.

```typescript
interface Wallet {
  id: string;
  tenantId: string;
  balance: number; // Total balance
  reservedBalance: number; // Reserved for pending operations
  currency: 'USD' | 'EUR' | 'GBP' | 'INR';
  lowBalanceThreshold: number; // Alert when below this
  autoRechargeEnabled: boolean;
  autoRechargeAmount: number;
  autoRechargeThreshold: number;
  totalCredited: number; // Lifetime total
  totalDebited: number; // Lifetime total
  lastToppedUpAt: Date | null;
  lastDebitedAt: Date | null;
}
```

### Available Balance

```typescript
availableBalance = balance - reservedBalance;
```

### Transaction Types

```typescript
enum TransactionType {
  CREDIT_PURCHASE = 'credit_purchase', // Wallet top-up
  SUBSCRIPTION_CREDIT = 'subscription_credit', // Monthly credit
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  TRIAL_CREDIT = 'trial_credit',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  SMS_DEDUCTION = 'sms_deduction', // SMS campaign
  EMAIL_DEDUCTION = 'email_deduction', // Email campaign
  SMS_REFUND = 'sms_refund',
  EMAIL_REFUND = 'email_refund',
  REFUND = 'refund',
  RESERVED = 'reserved', // Reserved for campaign
  RELEASED = 'released', // Released after campaign
}
```

### Wallet Operations

#### Top-Up

```typescript
// Create Stripe checkout for top-up
const { url } = await walletService.createTopUpSession(
  tenantId,
  stripeCustomerId,
  { amount: 50 } // Minimum $5
);

// Redirect user to Stripe Checkout
// Webhook processes payment and credits wallet
```

#### Debit (Campaign Send)

```typescript
await walletService.debit({
  tenantId,
  amount: 10.5,
  channel: TransactionChannel.SMS,
  description: 'Campaign: Summer Sale',
  referenceType: TransactionReferenceType.CAMPAIGN,
  referenceId: campaignId,
  messageCount: 1500,
  unitPrice: 0.007,
});
```

#### Fund Reservation (Before Campaign)

```typescript
// Reserve estimated cost
const transaction = await walletService.reserveFunds(
  tenantId,
  estimatedCost,
  campaignId,
  'Reserve for Summer Sale campaign'
);

// After campaign, release with actual cost
await walletService.releaseFunds(
  tenantId,
  transaction.id,
  actualCost // Unused amount returns to available
);
```

#### Refund

```typescript
await walletService.refund({
  tenantId,
  amount: 5.0,
  description: 'Refund for failed messages',
  referenceType: TransactionReferenceType.CAMPAIGN,
  referenceId: campaignId,
});
```

---

## Usage Tracking & Quotas

### Usage Quota Entity

Each tenant has a monthly usage quota that resets.

```typescript
interface UsageQuota {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;

  // SMS
  smsLimit: number;
  smsUsed: number;
  smsOverage: number;
  smsCost: number;

  // Email
  emailLimit: number;
  emailUsed: number;
  emailOverage: number;
  emailCost: number;

  // WhatsApp
  whatsappLimit: number;
  whatsappUsed: number;
  whatsappOverage: number;
  whatsappCost: number;

  // Resources
  contactsLimit: number;
  contactsUsed: number;
  campaignsLimit: number;
  campaignsUsed: number;

  totalCost: number;

  // Notification flags (prevent duplicates)
  sms80Notified: boolean;
  sms100Notified: boolean;
  email80Notified: boolean;
  email100Notified: boolean;
  whatsapp80Notified: boolean;
  whatsapp100Notified: boolean;
}
```

### Usage Channels

```typescript
enum UsageChannel {
  SMS = 'sms',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
}
```

### Key Operations

#### Check Quota Before Sending

```typescript
const result = await usageService.canSendMessages(
  tenantId,
  UsageChannel.SMS,
  1000, // message count
  'US' // country code for pricing
);

if (!result.canSend) {
  throw new Error(result.reason);
  // "Insufficient funds. Need $7.90 for 1000 messages beyond quota."
}
```

#### Increment Usage

```typescript
const { withinQuota, overageCount } = await usageService.incrementUsage(
  tenantId,
  UsageChannel.SMS,
  100, // count
  0.79 // cost
);

// withinQuota: false if exceeded quota
// overageCount: messages beyond quota
```

#### Cost Estimation

```typescript
const estimate = await usageService.estimateCost(tenantId, {
  channel: UsageChannel.SMS,
  messageCount: 5000,
  countryCode: 'US'
});

// Response:
{
  channel: 'sms',
  messageCount: 5000,
  quotaRemaining: 2000,    // From plan
  fromQuota: 2000,         // Free from quota
  fromWallet: 3000,        // Needs wallet
  unitPrice: 0.0079,       // Per message
  estimatedCost: 23.70,    // Total wallet needed
  walletBalance: 50.00,
  hasSufficientFunds: true,
  shortfall: 0
}
```

### Threshold Notifications

Events emitted at 80% and 100% usage:

```typescript
// 80% Warning
eventEmitter.emit('usage.threshold.warning', {
  tenantId,
  channel: 'sms',
  threshold: 80,
  used: 800,
  limit: 1000,
  percentUsed: 80,
});

// 100% Exceeded
eventEmitter.emit('usage.threshold.exceeded', {
  tenantId,
  channel: 'sms',
  threshold: 100,
  used: 1000,
  limit: 1000,
  percentUsed: 100,
});
```

### Quota Reset (Cron)

```typescript
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async checkAndResetQuotas() {
  // Find expired quotas
  // Create new quota period
  // Reset notification flags
  // Preserve contact count (doesn't reset)
}
```

---

## Pricing System

### SMS Pricing (Per Segment)

| Country      | Price/Segment |
| ------------ | ------------- |
| US           | $0.0079       |
| UK           | $0.04         |
| Canada       | $0.0085       |
| Australia    | $0.045        |
| India        | $0.0065       |
| Germany      | $0.085        |
| France       | $0.075        |
| Spain        | $0.065        |
| Italy        | $0.07         |
| Brazil       | $0.035        |
| Mexico       | $0.025        |
| Japan        | $0.08         |
| Singapore    | $0.055        |
| UAE          | $0.04         |
| South Africa | $0.03         |
| Default      | $0.015        |

### SMS Segments

```typescript
// GSM-7 encoding (standard chars): 160 chars = 1 segment
// UCS-2 encoding (unicode/emoji): 70 chars = 1 segment

function calculateSegments(message: string): number {
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const charsPerSegment = isUnicode ? 70 : 160;
  return Math.ceil(message.length / charsPerSegment);
}
```

### Email Pricing

```
$0.001 per email (flat rate)
```

### WhatsApp Pricing

```
$0.02 per message
$0.005 conversation fee (first message in 24h window)
```

### Cost Calculation

```typescript
// SMS Campaign
const cost = pricingService.calculateSmsCost(
  message, // For segment calculation
  countryCode, // For pricing
  recipientCount
);

// Full Campaign Estimate
const estimate = pricingService.estimateCampaignCost({
  channel: 'sms',
  message: 'Hello World!',
  recipientCount: 10000,
  countries: {
    US: 6000,
    UK: 2000,
    IN: 2000,
  },
});
```

---

## Stripe Integration

### StripeService Features

#### Customers

```typescript
// Create customer (at registration)
const customer = await stripeService.createCustomer({
  email: 'user@example.com',
  name: 'Company Name',
  tenantId: 'tenant-uuid',
});

// Update customer
await stripeService.updateCustomer(customerId, { name: 'New Name' });
```

#### Subscriptions

```typescript
// Create subscription
const subscription = await stripeService.createSubscription({
  customerId: 'cus_xxx',
  priceId: 'price_xxx',
  trialDays: 14,
  metadata: { tenantId, planTier },
});

// Change plan
await stripeService.changeSubscriptionPlan(
  subscriptionId,
  newPriceId,
  true // prorate
);

// Cancel
await stripeService.cancelSubscription(subscriptionId, true); // at period end
```

#### Checkout Sessions

```typescript
// Subscription checkout (onboarding)
const session = await stripeService.createCheckoutSession({
  customerId: 'cus_xxx',
  priceId: 'price_xxx',
  successUrl: 'https://app.com/onboarding/complete?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://app.com/onboarding/select-plan?cancelled=true',
  mode: 'subscription',
  trialDays: 14,
  metadata: { tenantId, planTier, type: 'onboarding' },
  paymentMethodCollection: 'always',
});

// Wallet top-up checkout
const session = await stripeService.createTopUpCheckoutSession({
  customerId: 'cus_xxx',
  amount: 50,
  currency: 'USD',
  successUrl: 'https://app.com/settings/billing?topup=success',
  cancelUrl: 'https://app.com/settings/billing?topup=cancelled',
  metadata: { tenantId, walletId, type: 'wallet_topup', amount: '50' },
});
```

#### Billing Portal

```typescript
const { url } = await stripeService.createBillingPortalSession({
  customerId: 'cus_xxx',
  returnUrl: 'https://app.com/settings/billing',
});
// Redirect user to Stripe-hosted billing management
```

#### Payment Methods

```typescript
// List cards
const methods = await stripeService.listPaymentMethods(customerId);

// Set default
await stripeService.setDefaultPaymentMethod(customerId, paymentMethodId);
```

---

## Webhook Handling

### Endpoint

```
POST /webhooks/stripe
```

### Handled Events

| Event                           | Action                              |
| ------------------------------- | ----------------------------------- |
| `customer.subscription.created` | Create/link subscription record     |
| `customer.subscription.updated` | Update status, period dates         |
| `customer.subscription.deleted` | Mark as cancelled                   |
| `invoice.paid`                  | Create invoice record, emit event   |
| `invoice.payment_failed`        | Create failed invoice, emit event   |
| `checkout.session.completed`    | Process wallet top-up or onboarding |
| `payment_intent.succeeded`      | Process wallet top-up               |
| `payment_intent.payment_failed` | Emit payment failed event           |

### Webhook Security

```typescript
// Signature verification
const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
```

### Event Handling Example

```typescript
private async handleCheckoutSessionCompleted(session: any) {
  const metadata = session.metadata || {};

  // Handle wallet top-up
  if (metadata.type === 'wallet_topup') {
    await this.walletService.processTopUp(
      metadata.tenantId,
      parseFloat(metadata.amount),
      session.payment_intent
    );
  }

  // Handle onboarding subscription
  if (metadata.type === 'onboarding' && session.subscription) {
    this.eventEmitter.emit('onboarding.completed', {
      tenantId: metadata.tenantId,
      planTier: metadata.planTier,
      stripeSubscriptionId: session.subscription
    });
  }
}
```

---

## Onboarding Flow

### User Journey

```
1. User registers (no subscription created)
2. Redirect to /onboarding/select-plan
3. User selects plan
   - FREE: Direct subscription creation → Dashboard
   - PAID: Redirect to Stripe Checkout
4. Complete Stripe Checkout (card collected)
5. Webhook creates subscription
6. Redirect to /onboarding/complete
7. User continues to Dashboard
```

### Plan Selection Page

```typescript
// POST /billing/subscriptions/onboarding-checkout
const { url } = await billingApi.createOnboardingCheckout('starter');
window.location.href = url; // Redirect to Stripe
```

### Completion Page

- Shows success message
- Displays trial information
- Next steps guidance
- Continue to dashboard button

---

## Invoices

### Invoice Entity

```typescript
interface Invoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  type: 'subscription' | 'one_time' | 'overage';
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'failed';

  // Stripe references
  stripeInvoiceId: string;
  stripeCustomerId: string;
  stripePaymentIntentId: string;
  stripeHostedInvoiceUrl: string;
  stripeInvoicePdf: string;

  // Billing period
  periodStart: Date;
  periodEnd: Date;

  // Amounts
  subtotal: number;
  tax: number;
  taxPercent: number;
  discount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;

  // Line items
  lineItems: InvoiceLineItem[];

  // Dates
  issuedAt: Date;
  dueDate: Date;
  paidAt: Date;

  // Customer snapshot
  customerEmail: string;
  customerName: string;
  billingAddress: Address;
}
```

### Invoice Retrieval

```typescript
// Get from Stripe (live data)
const invoices = await subscriptionService.getInvoices(stripeCustomerId, 20);

// Get single invoice
const invoice = await subscriptionService.getInvoice(stripeCustomerId, invoiceId);
```

---

## Guards & Protection

### BillingGuard

Protects routes requiring billing checks.

```typescript
@UseGuards(BillingGuard)
@BillingCheck()  // Requires active subscription
@Post('campaigns')
createCampaign() { }

@UseGuards(BillingGuard)
@QuotaCheck('sms')  // Requires SMS quota or wallet
@Post('campaigns/:id/send')
sendCampaign() { }
```

### ActiveSubscriptionGuard

Simple guard requiring any active subscription.

```typescript
@UseGuards(ActiveSubscriptionGuard)
@Get('premium-feature')
premiumFeature() { }
```

### Campaign Integration

```typescript
// Before campaign send
await validateBillingForCampaign(tenantId, campaign);

// After campaign completes
await finalizeCampaignBilling(campaignId);
// - Calculate actual costs
// - Increment usage
// - Deduct from wallet if overage
```

---

## Frontend Implementation

### API Client (billing.ts)

```typescript
export const billingApi = {
  // Plans
  getPlans: () => Promise<Plan[]>,

  // Subscriptions
  getSubscription: () => Promise<Subscription | null>,
  createSubscription: (planTier) => Promise<Subscription>,
  updateSubscription: (planTier, prorate?) => Promise<Subscription>,
  cancelSubscription: (cancelAtPeriodEnd?, reason?) => Promise<Subscription>,
  reactivateSubscription: () => Promise<Subscription>,

  // Checkout
  createCheckoutSession: (planTier) => Promise<{ url; sessionId }>,
  createOnboardingCheckout: (planTier) => Promise<{ url; sessionId }>,
  createBillingPortalSession: () => Promise<{ url }>,

  // Wallet
  getWallet: () => Promise<Wallet>,
  updateWalletSettings: (settings) => Promise<Wallet>,
  createTopUpSession: (amount) => Promise<{ url; sessionId }>,
  getTransactions: (params) => Promise<TransactionListResponse>,
  getBalance: () => Promise<{ balance; available; reserved; currency }>,

  // Usage
  getUsage: () => Promise<Usage>,
  getUsageSummary: () => Promise<UsageSummary>,
  estimateCost: (params) => Promise<CostEstimate>,
  getPricing: () => Promise<PricingTable>,

  // Invoices
  getInvoices: (limit?) => Promise<InvoiceListResponse>,
  getInvoice: (invoiceId) => Promise<Invoice>,
};
```

### React Query Hooks (use-billing.ts)

```typescript
// Plans
const { data: plans } = usePlans();

// Subscriptions
const { data: subscription } = useSubscription();
const { mutate: createCheckout } = useCreateCheckoutSession();
const { mutate: cancelSubscription } = useCancelSubscription();

// Wallet
const { data: wallet } = useWallet();
const { data: balance } = useWalletBalance();
const { mutate: topUp } = useCreateTopUpSession();
const { data: transactions } = useTransactions({ page: 1, limit: 20 });

// Usage
const { data: usage } = useUsage();
const { data: summary } = useUsageSummary();
const { mutate: estimate } = useEstimateCost();

// Invoices
const { data: invoices } = useInvoices();
```

### Billing Settings Page Features

1. **Plan Display**: Current plan with features
2. **Plan Comparison**: Side-by-side plan cards
3. **Upgrade/Downgrade**: Plan change flow
4. **Wallet Balance**: Current balance display
5. **Top-Up Button**: Redirect to Stripe checkout
6. **Transaction History**: Paginated list
7. **Invoice History**: Download PDF links
8. **Billing Portal**: Link to Stripe portal

---

## API Reference

### Subscription Endpoints

| Method | Endpoint                                   | Auth | Description                   |
| ------ | ------------------------------------------ | ---- | ----------------------------- |
| GET    | /billing/subscriptions/plans               | No   | Get all active plans          |
| GET    | /billing/subscriptions                     | Yes  | Get current subscription      |
| POST   | /billing/subscriptions                     | Yes  | Create subscription           |
| PUT    | /billing/subscriptions                     | Yes  | Update/change plan            |
| DELETE | /billing/subscriptions                     | Yes  | Cancel subscription           |
| POST   | /billing/subscriptions/reactivate          | Yes  | Reactivate subscription       |
| POST   | /billing/subscriptions/checkout            | Yes  | Create checkout session       |
| POST   | /billing/subscriptions/onboarding-checkout | Yes  | Create onboarding checkout    |
| POST   | /billing/subscriptions/billing-portal      | Yes  | Create billing portal session |
| GET    | /billing/subscriptions/invoices            | Yes  | Get invoice history           |
| GET    | /billing/subscriptions/invoices/:id        | Yes  | Get single invoice            |

### Wallet Endpoints

| Method | Endpoint                     | Auth | Description             |
| ------ | ---------------------------- | ---- | ----------------------- |
| GET    | /billing/wallet              | Yes  | Get wallet              |
| PUT    | /billing/wallet/settings     | Yes  | Update wallet settings  |
| POST   | /billing/wallet/topup        | Yes  | Create top-up session   |
| GET    | /billing/wallet/transactions | Yes  | Get transaction history |
| GET    | /billing/wallet/balance      | Yes  | Get quick balance       |

### Usage Endpoints

| Method | Endpoint                | Auth | Description            |
| ------ | ----------------------- | ---- | ---------------------- |
| GET    | /billing/usage          | Yes  | Get current usage      |
| GET    | /billing/usage/summary  | Yes  | Get usage summary      |
| POST   | /billing/usage/estimate | Yes  | Estimate campaign cost |
| GET    | /billing/usage/pricing  | Yes  | Get pricing table      |

### Webhook Endpoint

| Method | Endpoint         | Auth      | Description            |
| ------ | ---------------- | --------- | ---------------------- |
| POST   | /webhooks/stripe | Signature | Handle Stripe webhooks |

---

## Configuration

### Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# Billing
BILLING_TRIAL_DAYS=14

# SMS Pricing
BILLING_SMS_PRICE_US=0.0079
BILLING_SMS_PRICE_UK=0.04
BILLING_SMS_PRICE_IN=0.0065
BILLING_SMS_DEFAULT_PRICE=0.015

# Email Pricing
BILLING_EMAIL_DEFAULT_PRICE=0.001

# WhatsApp Pricing
BILLING_WHATSAPP_MESSAGE_PRICE=0.02
BILLING_WHATSAPP_CONVERSATION_FEE=0.005

# Frontend URL (for redirects)
FRONTEND_URL=https://app.yourplatform.com
```

### Stripe Dashboard Setup

1. Create Products for each plan tier
2. Create Prices (monthly/yearly) for each product
3. Configure Customer Portal settings
4. Set up Webhook endpoint with events:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.paid
   - invoice.payment_failed
   - checkout.session.completed
   - payment_intent.succeeded
   - payment_intent.payment_failed

---

## Database Schema

### Key Tables

```sql
-- Subscription Plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY,
  name VARCHAR(50),
  tier VARCHAR(20),  -- 'free', 'starter', 'growth', 'pro', 'enterprise'
  description TEXT,
  price DECIMAL(10,2),
  interval VARCHAR(10),  -- 'monthly', 'yearly'
  stripe_product_id VARCHAR(100),
  stripe_price_id VARCHAR(100),
  sms_quota INT,
  email_quota INT,
  whatsapp_quota INT,
  max_contacts INT,
  max_senders INT,
  max_users INT,
  max_campaigns_per_month INT,
  features JSONB,
  trial_days INT,
  is_active BOOLEAN,
  sort_order INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Tenant Subscriptions
CREATE TABLE tenant_subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  stripe_payment_method_id VARCHAR(100),
  status VARCHAR(30),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  cancel_at_period_end BOOLEAN,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Wallets
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  balance DECIMAL(12,4),
  reserved_balance DECIMAL(12,4),
  currency VARCHAR(3),
  low_balance_threshold DECIMAL(10,2),
  low_balance_alert_sent BOOLEAN,
  auto_recharge_enabled BOOLEAN,
  auto_recharge_amount DECIMAL(10,2),
  auto_recharge_threshold DECIMAL(10,2),
  total_credited DECIMAL(12,4),
  total_debited DECIMAL(12,4),
  last_topped_up_at TIMESTAMP,
  last_debited_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Wallet Transactions
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  wallet_id UUID REFERENCES wallets(id),
  type VARCHAR(30),
  status VARCHAR(20),
  amount DECIMAL(12,4),
  balance_before DECIMAL(12,4),
  balance_after DECIMAL(12,4),
  description TEXT,
  channel VARCHAR(20),
  reference_type VARCHAR(30),
  reference_id VARCHAR(100),
  message_count INT,
  unit_price DECIMAL(10,6),
  stripe_payment_intent_id VARCHAR(100),
  stripe_charge_id VARCHAR(100),
  metadata JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Usage Quotas
CREATE TABLE usage_quotas (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  sms_limit INT,
  sms_used INT,
  sms_overage INT,
  sms_cost DECIMAL(10,4),
  email_limit INT,
  email_used INT,
  email_overage INT,
  email_cost DECIMAL(10,4),
  whatsapp_limit INT,
  whatsapp_used INT,
  whatsapp_overage INT,
  whatsapp_cost DECIMAL(10,4),
  contacts_limit INT,
  contacts_used INT,
  campaigns_limit INT,
  campaigns_used INT,
  total_cost DECIMAL(10,4),
  is_current BOOLEAN,
  last_reset_at TIMESTAMP,
  sms_80_notified BOOLEAN,
  sms_100_notified BOOLEAN,
  email_80_notified BOOLEAN,
  email_100_notified BOOLEAN,
  whatsapp_80_notified BOOLEAN,
  whatsapp_100_notified BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  invoice_number VARCHAR(50) UNIQUE,
  type VARCHAR(20),
  status VARCHAR(20),
  stripe_invoice_id VARCHAR(100),
  stripe_customer_id VARCHAR(100),
  stripe_payment_intent_id VARCHAR(100),
  stripe_hosted_invoice_url TEXT,
  stripe_invoice_pdf TEXT,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  subtotal DECIMAL(10,2),
  tax DECIMAL(10,2),
  tax_percent DECIMAL(5,2),
  discount DECIMAL(10,2),
  total DECIMAL(10,2),
  amount_paid DECIMAL(10,2),
  amount_due DECIMAL(10,2),
  currency VARCHAR(3),
  line_items JSONB,
  issued_at TIMESTAMP,
  due_date TIMESTAMP,
  paid_at TIMESTAMP,
  voided_at TIMESTAMP,
  customer_email VARCHAR(255),
  customer_name VARCHAR(255),
  billing_address JSONB,
  notes TEXT,
  footer TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Future Enhancements

- [ ] Email notifications for usage warnings
- [ ] Auto-recharge trigger implementation
- [ ] Coupon/promo code support
- [ ] Multi-currency wallet
- [ ] Usage analytics dashboard
- [ ] Revenue reports for admins
- [ ] Affiliate/referral system
- [ ] Bulk pricing tiers
