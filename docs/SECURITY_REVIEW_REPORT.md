# Security Review Report - Marketing SMS Platform

**Date:** January 2026
**Scope:** Pre-deployment security assessment for Email & SMS features
**Status:** Review Complete - Action Required

---

## Executive Summary

| Severity     | Count | Status                              |
| ------------ | ----- | ----------------------------------- |
| **CRITICAL** | 5     | Must fix before deployment          |
| **HIGH**     | 8     | Should fix before deployment        |
| **MEDIUM**   | 12    | Fix in first sprint post-deployment |
| **LOW**      | 4     | Address when convenient             |

**Overall Assessment:** The platform has a solid security foundation with proper authentication, input validation, and tenant isolation. However, several critical issues must be addressed before production deployment.

---

## CRITICAL ISSUES (Must Fix)

### 1. AWS/API Credentials Exposed in .env File

**File:** `apps/api/.env`
**Lines:** 52-53, and throughout

**Issue:** Real AWS access keys, Stripe keys, and Twilio credentials are committed to the repository.

```
AWS_ACCESS_KEY_ID=AKIA************HEV   # REDACTED - Rotate immediately!
AWS_SECRET_ACCESS_KEY=****REDACTED****  # REDACTED - Rotate immediately!
```

**Impact:** Complete AWS account compromise, financial loss, data breach.

**Remediation:**

1. **IMMEDIATELY** rotate all exposed credentials
2. Remove `.env` from git history using `git filter-branch` or BFG Repo-Cleaner
3. Add `.env` to `.gitignore`
4. Use AWS Secrets Manager or environment variables in production

---

### 2. Twilio Webhook Signature NOT Verified

**File:** `apps/api/src/modules/campaigns/controllers/sms-webhook.controller.ts`
**Lines:** 23-108

**Issue:** The `x-twilio-signature` header is received but never validated. Attackers can forge SMS delivery statuses.

**Impact:** Campaign data manipulation, false delivery reports, cross-tenant data corruption.

**Remediation:**

```typescript
import twilio from 'twilio';

const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, webhookUrl, body);
if (!isValid) {
  throw new UnauthorizedException('Invalid Twilio signature');
}
```

---

### 3. SSL Certificate Validation Disabled for Database

**File:** `apps/api/src/config/database.config.ts`
**Lines:** 16-20

**Issue:** `rejectUnauthorized: false` disables SSL certificate validation, enabling MITM attacks.

```typescript
ssl: configService.get<boolean>('database.ssl')
  ? { rejectUnauthorized: false }  // VULNERABLE
  : false,
```

**Impact:** Database credentials and all queries visible to network attackers.

**Remediation:**

```typescript
ssl: configService.get<boolean>('database.ssl')
  ? {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_CA_CERT
    }
  : false,
```

---

### 4. OAuth Tokens Passed in URL Query Parameters

**File:** `apps/api/src/modules/auth/auth.controller.ts`
**Lines:** 162-168

**Issue:** Access and refresh tokens are passed via URL query parameters during Google OAuth callback.

```typescript
redirectUrl.searchParams.set('accessToken', result.tokens.accessToken);
redirectUrl.searchParams.set('refreshToken', result.tokens.refreshToken);
```

**Impact:** Tokens exposed in browser history, server logs, referrer headers.

**Remediation:** Use authorization code flow with backend-to-backend token exchange, or set tokens via secure HTTP-only cookies.

---

### 5. Password Reset Not Implemented

**File:** `apps/api/src/modules/auth/auth.service.ts`
**Lines:** 198-223

**Issue:** `forgotPassword()` and `resetPassword()` methods have TODO comments and throw errors.

**Impact:** Users cannot recover accounts, potential support burden.

**Remediation:** Implement Redis-backed token storage with 1-hour expiry and email notification.

---

## HIGH SEVERITY ISSUES

### 6. Missing Rate Limiting on Auth Endpoints

**File:** `apps/api/src/modules/auth/auth.controller.ts`
**Lines:** 43-104

**Issue:** Login, register, and password reset endpoints lack `@Throttle()` decorator.

**Remediation:**

```typescript
@Post('login')
@Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 min
async login(@Body() dto: LoginDto) { ... }
```

---

### 7. Weak JWT Secrets in Configuration

**File:** `apps/api/src/config/configuration.ts`
**Lines:** 33-38

**Issue:** Default secrets are weak placeholder strings.

**Remediation:**

- Generate 64-character random secrets
- Add startup validation to reject weak secrets
- Use separate secrets for access/refresh tokens

---

### 8. SMS Webhook Missing Tenant Validation

**File:** `apps/api/src/modules/campaigns/controllers/sms-webhook.controller.ts`
**Lines:** 29-30, 67

**Issue:** Tenant ID accepted as unvalidated query parameter.

**Remediation:** Verify tenant ownership via message lookup before processing.

---

### 9. SNS Signature Verification Disabled in Non-Production

**File:** `apps/api/src/modules/campaigns/controllers/ses-webhook.controller.ts`
**Lines:** 209, 281-284

**Issue:** AWS SNS signature verification only enabled when `NODE_ENV === 'production'`.

**Remediation:** Enable verification in all environments.

---

### 10. No Idempotency for Stripe Webhooks

**File:** `apps/api/src/modules/billing/controllers/stripe-webhook.controller.ts`
**Lines:** 41-122

**Issue:** Duplicate webhook processing can cause double-charging.

**Remediation:** Add idempotency key checking using Redis.

---

### 11. Inconsistent Bcrypt Rounds

**Files:** Multiple auth files

**Issue:** Passwords use 12 rounds, refresh tokens use 10 rounds.

**Remediation:** Standardize on 12 rounds for all hashing.

---

### 12. No CSRF Protection on OAuth Flow

**File:** `apps/api/src/modules/auth/strategies/google.strategy.ts`

**Issue:** OAuth state parameter not validated.

**Remediation:** Implement state parameter with Redis-backed validation.

---

### 13. Sorting Field Validation Inconsistent

**File:** `apps/api/src/modules/contacts/contacts.service.ts`
**Line:** 238

**Issue:** Sort field not validated against allowlist (unlike campaigns service).

**Remediation:** Apply same allowlist pattern as campaigns.service.ts.

---

## MEDIUM SEVERITY ISSUES

| Issue                                  | File                         | Remediation                           |
| -------------------------------------- | ---------------------------- | ------------------------------------- |
| No explicit body size limits           | main.ts                      | Add `express.json({ limit: '10mb' })` |
| Redis TLS not configured               | configuration.ts             | Add TLS config for Redis              |
| X-Forwarded-For can be spoofed         | tracking.controller.ts       | Validate against trusted proxy list   |
| Health endpoints expose internals      | health.controller.ts         | Protect or restrict in production     |
| Swagger exposed in all environments    | main.ts                      | Disable in production                 |
| Certificate caching without revocation | ses-webhook.controller.ts    | Add CRL/OCSP checking                 |
| Sensitive data in logs                 | Multiple                     | Review and sanitize logging           |
| Raw body type-unsafe casting           | stripe-webhook.controller.ts | Improve type safety                   |
| API Keys module not implemented        | api-keys.module.ts           | Implement or remove                   |
| No global auth guard                   | app.module.ts                | Apply JWT guard globally              |
| No HTTPS enforcement                   | main.ts                      | Add HSTS headers                      |
| Token revocation incomplete            | auth.service.ts              | Implement token blacklist             |

---

## POSITIVE SECURITY FINDINGS

- Parameterized queries used throughout (no SQL injection)
- Bcrypt password hashing with proper rounds (12)
- Refresh tokens hashed before storage
- Account lockout after 5 failed attempts (15-minute lock)
- Comprehensive open redirect protection
- Tenant isolation enforced at application layer
- Helmet.js security headers configured
- Input validation with class-validator
- Stripe webhook signature verification implemented
- SES webhook certificate validation implemented (in production)

---

## Security Metrics

| Category             | Score | Notes                                |
| -------------------- | ----- | ------------------------------------ |
| Authentication       | 7/10  | Good foundation, needs rate limiting |
| Authorization        | 8/10  | RBAC and tenant isolation work well  |
| Input Validation     | 9/10  | Comprehensive class-validator usage  |
| Data Protection      | 6/10  | SSL issues, credential exposure      |
| API Security         | 7/10  | CORS, Helmet OK; missing some guards |
| Webhook Security     | 5/10  | Twilio not verified, inconsistent    |
| Logging & Monitoring | 6/10  | Needs sensitive data review          |

**Overall Security Score: 68/100** - Needs critical fixes before deployment
