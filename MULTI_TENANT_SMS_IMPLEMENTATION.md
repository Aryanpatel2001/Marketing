# Multi-Tenant Twilio SMS Credentials Management Plan

## Overview

Implement a comprehensive multi-tenant SMS infrastructure that supports:

1. **Shared Pool** (Free/Starter) - Use platform's Twilio account
2. **Dedicated Numbers** (Pro) - Tenant-specific phone numbers purchased via Twilio API
3. **Sender IDs** (Enterprise) - Alpha tags like "BRANDNAME"
4. **BYOC** (Enterprise) - Bring Your Own Credentials with encrypted storage

## Current State Analysis

### Existing Components

- `SmsSenderId` entity exists (`apps/api/src/modules/campaigns/entities/sms-sender-id.entity.ts`)
- `TwilioProvider` - Single global Twilio client from env vars (`apps/api/src/providers/sms/providers/twilio.provider.ts`)
- `SmsService` - Not tenant-aware, uses single provider (`apps/api/src/providers/sms/sms.service.ts`)
- `Tenant` entity - Has `plan` field for tier differentiation
- Billing module exists with wallet/credit system

### What's Missing

- Per-tenant SMS settings with encrypted BYOC credentials
- Dedicated phone number entity and purchasing flow
- Tenant-aware SMS service that selects correct credentials
- Provider factory for creating tenant-specific Twilio clients
- Encryption service for credential security

---

## Implementation Steps

### Step 1: Create Encryption Service

**File:** `apps/api/src/common/services/encryption.service.ts`

```typescript
@Injectable()
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor(configService: ConfigService) {
    // Key from ENCRYPTION_KEY env var (32 bytes for AES-256)
    this.key = Buffer.from(configService.get('ENCRYPTION_KEY'), 'hex');
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; tag: string };
  decrypt(encrypted: string, iv: string, tag: string): string;
}
```

### Step 2: Create Database Entities

**File:** `apps/api/src/modules/sms/entities/tenant-sms-settings.entity.ts`

```typescript
@Entity('tenant_sms_settings')
export class TenantSmsSettings extends BaseEntity {
  tenantId: string; // unique, FK to tenants

  // Default sending configuration
  defaultSenderType: 'shared' | 'dedicated' | 'sender_id' | 'byoc';
  defaultPhoneNumberId?: string; // FK to DedicatedPhoneNumber
  defaultSenderIdId?: string; // FK to SmsSenderId

  // BYOC - Encrypted credentials
  byocEnabled: boolean;
  twilioAccountSidEnc?: string;
  twilioAuthTokenEnc?: string;
  twilioEncryptionIv?: string;
  twilioEncryptionTag?: string;
  twilioMessagingServiceSid?: string;

  // Rate limiting per tenant
  maxSmsPerMinute: number;
  maxSmsPerDay: number;

  // Webhook URL for delivery receipts
  webhookUrl?: string;
}
```

**File:** `apps/api/src/modules/sms/entities/dedicated-phone-number.entity.ts`

```typescript
@Entity('dedicated_phone_numbers')
export class DedicatedPhoneNumber extends TenantSoftDeleteEntity {
  phoneNumber: string; // E.164 format
  twilioSid: string; // Twilio phone number SID
  friendlyName?: string;
  countryCode: string;
  capabilities: { sms: boolean; voice: boolean; mms: boolean };
  status: 'active' | 'released' | 'pending';
  monthlyPrice: number;
  purchasedAt: Date;
  renewsAt: Date;
  isDefault: boolean;
}
```

### Step 3: Create Twilio Provider Factory

**File:** `apps/api/src/providers/sms/twilio-provider.factory.ts`

```typescript
@Injectable()
export class TwilioProviderFactory {
  private clientCache: Map<string, { client: Twilio; expiresAt: number }>;

  constructor(
    private configService: ConfigService,
    private encryptionService: EncryptionService,
    @InjectRepository(TenantSmsSettings)
    private settingsRepo: Repository<TenantSmsSettings>
  ) {}

  // Get platform's shared Twilio client
  getSharedClient(): Twilio;

  // Get tenant-specific client (BYOC or shared)
  async getClientForTenant(tenantId: string): Promise<{
    client: Twilio;
    isShared: boolean;
    messagingServiceSid?: string;
  }>;

  // Clear cached client when credentials change
  invalidateCache(tenantId: string): void;
}
```

### Step 4: Update SMS Service for Multi-Tenant

**File:** `apps/api/src/providers/sms/sms.service.ts` (modify existing)

Add tenant-aware methods:

```typescript
async sendSmsForTenant(
  tenantId: string,
  options: SendSmsOptions,
  senderOptions?: {
    senderId?: string;      // Specific sender ID to use
    phoneNumberId?: string; // Specific dedicated number to use
  }
): Promise<SmsResult>

async getSenderOptionsForTenant(tenantId: string): Promise<{
  defaultSenderType: string;
  availableSenderIds: SmsSenderId[];
  availablePhoneNumbers: DedicatedPhoneNumber[];
  canUseBYOC: boolean;
}>
```

### Step 5: Create Phone Number Service

**File:** `apps/api/src/modules/sms/services/phone-number.service.ts`

```typescript
@Injectable()
export class PhoneNumberService {
  // Search available numbers from Twilio
  async searchAvailableNumbers(
    tenantId: string,
    options: { country: string; type: 'local' | 'mobile' | 'toll-free'; areaCode?: string }
  ): Promise<AvailableNumber[]>;

  // Purchase a number and assign to tenant
  async purchaseNumber(tenantId: string, phoneNumber: string): Promise<DedicatedPhoneNumber>;

  // Release a number back to Twilio
  async releaseNumber(tenantId: string, phoneNumberId: string): Promise<void>;

  // List tenant's phone numbers
  async listTenantNumbers(tenantId: string): Promise<DedicatedPhoneNumber[]>;

  // Set default number for tenant
  async setDefaultNumber(tenantId: string, phoneNumberId: string): Promise<void>;
}
```

### Step 6: Create Sender ID Service

**File:** `apps/api/src/modules/sms/services/sender-id.service.ts`

```typescript
@Injectable()
export class SenderIdService {
  // Register new sender ID (starts as PENDING)
  async registerSenderId(tenantId: string, dto: CreateSenderIdDto): Promise<SmsSenderId>;

  // Admin: Approve/reject sender ID
  async updateSenderIdStatus(
    senderId: string,
    status: 'approved' | 'rejected',
    adminNotes?: string
  ): Promise<SmsSenderId>;

  // Register approved sender ID with Twilio
  async registerWithTwilio(senderId: string): Promise<void>;

  // List tenant's sender IDs
  async listTenantSenderIds(tenantId: string): Promise<SmsSenderId[]>;

  // Set default sender ID
  async setDefaultSenderId(tenantId: string, senderId: string): Promise<void>;
}
```

### Step 7: Create SMS Settings Service

**File:** `apps/api/src/modules/sms/services/sms-settings.service.ts`

```typescript
@Injectable()
export class SmsSettingsService {
  // Get tenant's SMS settings (create default if not exists)
  async getSettings(tenantId: string): Promise<TenantSmsSettings>;

  // Create/update settings
  async updateSettings(tenantId: string, dto: UpdateSmsSettingsDto): Promise<TenantSmsSettings>;

  // Configure BYOC credentials (Enterprise only)
  async configureBYOC(
    tenantId: string,
    credentials: { accountSid: string; authToken: string; messagingServiceSid?: string }
  ): Promise<{ success: boolean; errors?: string[] }>;

  // Verify BYOC credentials are valid
  async verifyBYOCCredentials(tenantId: string): Promise<{
    valid: boolean;
    balance?: number;
    errors?: string[];
  }>;

  // Disable BYOC and revert to shared
  async disableBYOC(tenantId: string): Promise<void>;
}
```

### Step 8: Create Controllers

**File:** `apps/api/src/modules/sms/controllers/sms-settings.controller.ts`

```
GET  /sms/settings          - Get tenant SMS settings
PATCH /sms/settings         - Update settings
POST /sms/settings/byoc     - Configure BYOC credentials
POST /sms/settings/byoc/verify - Verify BYOC credentials
DELETE /sms/settings/byoc   - Disable BYOC
```

**File:** `apps/api/src/modules/sms/controllers/phone-numbers.controller.ts`

```
GET  /sms/phone-numbers/available - Search available numbers
GET  /sms/phone-numbers           - List tenant's numbers
POST /sms/phone-numbers           - Purchase number
DELETE /sms/phone-numbers/:id     - Release number
POST /sms/phone-numbers/:id/default - Set as default
```

**File:** `apps/api/src/modules/sms/controllers/sender-ids.controller.ts`

```
GET  /sms/sender-ids        - List tenant's sender IDs
POST /sms/sender-ids        - Register new sender ID
DELETE /sms/sender-ids/:id  - Delete sender ID
POST /sms/sender-ids/:id/default - Set as default
```

### Step 9: Create SMS Module

**File:** `apps/api/src/modules/sms/sms.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([TenantSmsSettings, DedicatedPhoneNumber, SmsSenderId]),
    forwardRef(() => BillingModule),
    forwardRef(() => TenantsModule),
  ],
  providers: [
    EncryptionService,
    TwilioProviderFactory,
    SmsService,
    PhoneNumberService,
    SenderIdService,
    SmsSettingsService,
  ],
  controllers: [SmsSettingsController, PhoneNumbersController, SenderIdsController],
  exports: [SmsService, TwilioProviderFactory, SmsSettingsService],
})
export class SmsModule {}
```

### Step 10: Update Campaign Send Worker

**File:** `apps/api/src/modules/campaigns/workers/sms-send.worker.ts` (modify)

Update to use tenant-aware SMS service:

```typescript
// Before (current):
await this.smsService.sendSms(options);

// After (multi-tenant):
await this.smsService.sendSmsForTenant(tenantId, options, {
  senderId: campaign.senderId,
  phoneNumberId: campaign.phoneNumberId,
});
```

---

## Plan Tier Restrictions

Implement in `SmsSettingsService.validateTierAccess()`:

| Feature           | Free   | Starter | Pro     | Enterprise |
| ----------------- | ------ | ------- | ------- | ---------- |
| Shared Pool       | Yes    | Yes     | Yes     | Yes        |
| Dedicated Numbers | No     | No      | Up to 3 | Unlimited  |
| Sender IDs        | No     | No      | No      | Yes        |
| BYOC              | No     | No      | No      | Yes        |
| Rate Limit        | 10/min | 30/min  | 100/min | Custom     |

---

## Files to Create

- `apps/api/src/common/services/encryption.service.ts`
- `apps/api/src/modules/sms/sms.module.ts`
- `apps/api/src/modules/sms/entities/tenant-sms-settings.entity.ts`
- `apps/api/src/modules/sms/entities/dedicated-phone-number.entity.ts`
- `apps/api/src/modules/sms/entities/index.ts`
- `apps/api/src/modules/sms/services/phone-number.service.ts`
- `apps/api/src/modules/sms/services/sender-id.service.ts`
- `apps/api/src/modules/sms/services/sms-settings.service.ts`
- `apps/api/src/modules/sms/controllers/sms-settings.controller.ts`
- `apps/api/src/modules/sms/controllers/phone-numbers.controller.ts`
- `apps/api/src/modules/sms/controllers/sender-ids.controller.ts`
- `apps/api/src/modules/sms/dto/sms-settings.dto.ts`
- `apps/api/src/modules/sms/dto/phone-number.dto.ts`
- `apps/api/src/modules/sms/dto/sender-id.dto.ts`
- `apps/api/src/modules/sms/dto/index.ts`
- `apps/api/src/providers/sms/twilio-provider.factory.ts`

## Files to Modify

- `apps/api/src/app.module.ts` - Import SmsModule
- `apps/api/src/providers/sms/sms.service.ts` - Add tenant-aware methods
- `apps/api/src/modules/campaigns/workers/sms-send.worker.ts` - Use tenant-aware sending
- `apps/api/src/modules/campaigns/campaigns.module.ts` - Import SmsModule
- `apps/api/src/config/configuration.ts` - Add ENCRYPTION_KEY config
- `apps/api/.env.example` - Add ENCRYPTION_KEY

---

## Database Migration

```sql
-- Tenant SMS Settings
CREATE TABLE "tenant_sms_settings" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "default_sender_type" VARCHAR(20) DEFAULT 'shared',
  "default_phone_number_id" UUID,
  "default_sender_id_id" UUID,
  "byoc_enabled" BOOLEAN DEFAULT FALSE,
  "twilio_account_sid_enc" TEXT,
  "twilio_auth_token_enc" TEXT,
  "twilio_encryption_iv" VARCHAR(64),
  "twilio_encryption_tag" VARCHAR(64),
  "twilio_messaging_service_sid" VARCHAR(100),
  "max_sms_per_minute" INTEGER DEFAULT 60,
  "max_sms_per_day" INTEGER DEFAULT 10000,
  "webhook_url" VARCHAR(500),
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Dedicated Phone Numbers
CREATE TABLE "dedicated_phone_numbers" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "phone_number" VARCHAR(20) NOT NULL,
  "twilio_sid" VARCHAR(100) NOT NULL,
  "friendly_name" VARCHAR(100),
  "country_code" VARCHAR(5) NOT NULL,
  "capabilities" JSONB DEFAULT '{"sms": true, "voice": false, "mms": false}',
  "status" VARCHAR(20) DEFAULT 'active',
  "monthly_price" DECIMAL(10,2),
  "purchased_at" TIMESTAMP DEFAULT NOW(),
  "renews_at" TIMESTAMP,
  "is_default" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  "deleted_at" TIMESTAMP
);

CREATE INDEX "idx_dedicated_phone_tenant" ON "dedicated_phone_numbers"("tenant_id");
CREATE INDEX "idx_tenant_sms_settings_tenant" ON "tenant_sms_settings"("tenant_id");
CREATE UNIQUE INDEX "idx_dedicated_phone_number" ON "dedicated_phone_numbers"("phone_number") WHERE "deleted_at" IS NULL;
```

---

## Verification Steps

1. **Build Check**: Run `npm run build` to verify TypeScript compilation
2. **Migration**: Create and run database migration for new tables
3. **Unit Tests**:
   - Test encryption service with encrypt/decrypt cycle
   - Test tier restriction logic
4. **API Tests** via Swagger:
   - Create tenant SMS settings
   - Configure BYOC credentials (verify encryption in DB)
   - Search available phone numbers (Twilio API)
   - Purchase phone number (use Twilio test mode)
   - Register sender ID (verify PENDING status)
5. **Integration Test**:
   - Create tenant with Pro plan
   - Purchase dedicated number
   - Send SMS campaign using dedicated number
   - Verify correct "from" number used
   - Verify credit deduction
6. **Security Test**:
   - Query database directly
   - Verify encrypted credentials cannot be read
   - Verify decryption only works with correct key
