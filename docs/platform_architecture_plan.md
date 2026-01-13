# Multi-Tenant SMS Platform: Architecture & Implementation Plan

## 1. Architecture Overview

Transitioning from a single-tenant environment to a robust multi-tenant SaaS platform requires three core pillars:

1.  **Centralized Billing & Credits**: The foundation for usage limits and monetization.
2.  **Tiered SMS Capabilities**: Differentiating features (Shared vs. Dedicated vs. Sender ID) based on subscription plans.
3.  **Secure Organization Management**: Encrypted credential storage (future-proofing for BYOC) and per-organization settings.

---

## 2. Implementation Roadmap

### Phase 1: Payment & Billing System (Priority 🚨)

**Goal**: Establish the infrastructure to charge users and manage usage limits _before_ expanding SMS capabilities.

1.  **Payment Gateway Integration**
    - Providers: Razorpay (India/UPI) & Stripe (Global).
    - Models:
      - **Subscription**: Monthly recurring (SaaS fees).
      - **One-time**: Credit top-ups (Wallet system).

2.  **Wallet/Credit System**
    - Each Organization has a `wallet_balance`.
    - **Logic**:
      - Deduct 1 credit per SMS (or variable based on destination).
      - Check balance _before_ sending to Twilio.
      - Block sending if `balance <= 0`.

3.  **Plan Tiers**
    - **Free**: Limited credits, Shared Number Pool.
    - **Pro**: Monthly sub, Dedicated Number options.
    - **Enterprise**: Custom pricing, Sender ID (Alpha tags), BYOC options.

### Phase 2: SMS Infrastructure Enhancement

**Goal**: Enable diverse sending capabilities based on the user's plan.

1.  **Tier 1: Shared Number Pool (Default/Free)**
    - **Mechanism**: All users send via the platform's main Twilio Messaging Service.
    - **Pros**: Instant setup, no cost to user, auto-scaling.
    - **Cons**: No guaranteed replies, numeric ID varies.

2.  **Tier 2: Dedicated Numbers (Pro)**
    - **Flow**:
      1.  User selects Country & Type (Local/Mobile).
      2.  System queries Twilio API for available numbers.
      3.  User purchases -> System buys via API -> Assigns to Organization.
    - **Technical**: map `organization_id` <-> `twilio_phone_sid`.

3.  **Tier 3: Sender IDs (Enterprise/Regional)**
    - **Flow**:
      1.  User submits "Brand Name" & Compliance Docs (DLT for India).
      2.  Status: `PENDING` -> Admin verifies/Submits to Twilio/DLT -> `APPROVED`.
      3.  System registers Alpha Sender on Twilio Messaging Service.
    - **Usage**: Send as "BRANDNAME" instead of number.

---

## 3. Database Schema Extensions

### Organization & Credits

```sql
ALTER TABLE "Organization" ADD COLUMN "wallet_balance" DECIMAL(10,2) DEFAULT 0.00;
ALTER TABLE "Organization" ADD COLUMN "subscription_plan" VARCHAR(50) DEFAULT 'FREE'; -- FREE, PRO, ENTERPRISE
```

### SMS Settings & Credentials

```sql
CREATE TABLE "OrganizationSmsSettings" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id"),
  "sms_provider" VARCHAR(50) DEFAULT 'TWILIO', -- TWILIO, MSG91, AWS_SNS
  "default_sender_type" VARCHAR(20) DEFAULT 'SHARED', -- SHARED, DEDICATED, SENDER_ID

  -- For BYOC (Bring Your Own Credentials) - Encrypted!
  "twilio_account_sid_enc" TEXT,
  "twilio_auth_token_enc" TEXT,

  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);
```

### Dedicated Numbers & Sender IDs

```sql
CREATE TABLE "DedicatedPhoneNumber" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id"),
  "phone_number" VARCHAR(20) NOT NULL,
  "twilio_sid" VARCHAR(100) NOT NULL,
  "country_code" VARCHAR(5) NOT NULL,
  "status" VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, RELEASED
  "monthly_cost" DECIMAL(10,2),
  "renews_at" TIMESTAMP
);

CREATE TABLE "SenderId" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id"),
  "sender_id" VARCHAR(11) NOT NULL, -- e.g., "TRUMPCO"
  "status" VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  "dlt_entity_id" VARCHAR(100), -- For India
  "twilio_sid" VARCHAR(100),
  "documents" JSONB -- Links to uploaded verification docs
);
```

---

## 4. Next Steps (Immediate Action)

1.  **Setup Payment Provider** accounts (Stripe/Razorpay).
2.  **Scaffold Billing API** in the backend (Wallet endpoints).
3.  **Create "Plans & Billing" Page** in the dashboard.
