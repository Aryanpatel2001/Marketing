# Deployment Checklist - Marketing SMS Platform

**Version:** 1.0 (Email & SMS Features)
**Target:** Production Deployment

---

## Pre-Deployment Checklist

### Phase 1: Critical Security Fixes (MUST DO)

- [ ] **1.1 Rotate All Exposed Credentials**
  - [ ] Generate new AWS Access Keys and rotate in AWS Console
  - [ ] Generate new Stripe API keys (Test and Live)
  - [ ] Generate new Twilio Auth Token
  - [ ] Generate new JWT secrets (64+ characters each)
  - [ ] Remove `.env` from git history
  - [ ] Add `.env` to `.gitignore` if not already present

- [ ] **1.2 Implement Twilio Webhook Signature Verification**
  - [ ] Add signature validation in `sms-webhook.controller.ts`
  - [ ] Test with Twilio's request validator
  - [ ] Add `@Public()` decorator to webhook endpoints

- [ ] **1.3 Fix Database SSL Configuration**
  - [ ] Set `rejectUnauthorized: true` in database.config.ts
  - [ ] Configure CA certificate for production database
  - [ ] Test database connection with SSL verification

- [ ] **1.4 Add Rate Limiting to Auth Endpoints**
  - [ ] Add `@Throttle()` to `/auth/login` (5 per 15 min)
  - [ ] Add `@Throttle()` to `/auth/register` (3 per hour)
  - [ ] Add `@Throttle()` to `/auth/forgot-password` (3 per hour)
  - [ ] Add `@Throttle()` to `/auth/refresh` (30 per hour)

- [ ] **1.5 Fix OAuth Token Delivery**
  - [ ] Implement secure cookie-based token delivery OR
  - [ ] Use authorization code flow with backend exchange

---

### Phase 2: Infrastructure Setup

- [ ] **2.1 AWS Configuration**
  - [ ] Create production AWS account/organization
  - [ ] Set up IAM roles with least-privilege access
  - [ ] Configure AWS Secrets Manager for credentials
  - [ ] Set up CloudWatch for logging and monitoring
  - [ ] Configure AWS WAF for DDoS protection

- [ ] **2.2 Database (PostgreSQL)**
  - [ ] Provision RDS PostgreSQL instance (Multi-AZ recommended)
  - [ ] Configure security groups (restrict to application servers)
  - [ ] Enable encryption at rest
  - [ ] Enable SSL/TLS connections
  - [ ] Set up automated backups (7-day retention minimum)
  - [ ] Run all database migrations
  - [ ] Seed subscription plans

- [ ] **2.3 Redis**
  - [ ] Provision ElastiCache Redis cluster
  - [ ] Enable TLS for Redis connections
  - [ ] Configure security groups
  - [ ] Enable encryption at rest

- [ ] **2.4 RabbitMQ**
  - [ ] Provision Amazon MQ (RabbitMQ)
  - [ ] Enable TLS for connections
  - [ ] Configure dead letter queues
  - [ ] Set up monitoring for queue depth

- [ ] **2.5 Application Hosting**
  - [ ] Set up ECS Fargate or EC2 instances
  - [ ] Configure auto-scaling policies
  - [ ] Set up Application Load Balancer
  - [ ] Configure health check endpoints
  - [ ] Set up SSL certificate (ACM)

---

### Phase 3: External Service Configuration

- [ ] **3.1 AWS SES (Email)**
  - [ ] Request production access (move out of sandbox)
  - [ ] Verify sending domain
  - [ ] Configure DKIM (2048-bit)
  - [ ] Set up SPF record
  - [ ] Configure DMARC policy
  - [ ] Create configuration set for tracking
  - [ ] Set up SNS topic for bounce/complaint notifications
  - [ ] Configure SNS webhook endpoint
  - [ ] Test email sending

- [ ] **3.2 Twilio (SMS)**
  - [ ] Upgrade to production Twilio account
  - [ ] Purchase phone numbers
  - [ ] Register for 10DLC (US) if applicable
    - [ ] Submit brand registration
    - [ ] Submit campaign registration
    - [ ] Wait for approval (can take 1-4 weeks)
  - [ ] Configure Messaging Service (optional)
  - [ ] Set up webhook URLs for status callbacks
  - [ ] Configure inbound SMS webhook
  - [ ] Test SMS sending

- [ ] **3.3 Stripe (Billing)**
  - [ ] Create production Stripe account
  - [ ] Create products and prices in Stripe Dashboard
    - [ ] FREE plan
    - [ ] STARTER plan ($29/month)
    - [ ] GROWTH plan ($99/month)
    - [ ] PRO plan ($299/month)
  - [ ] Configure Customer Portal
  - [ ] Set up webhook endpoint
  - [ ] Configure webhook signing secret
  - [ ] Test payment flow end-to-end

---

### Phase 4: Environment Configuration

- [ ] **4.1 Production Environment Variables**

  ```bash
  # Application
  NODE_ENV=production
  PORT=3000
  API_URL=https://api.yourdomain.com
  FRONTEND_URL=https://app.yourdomain.com

  # Database (from Secrets Manager)
  DATABASE_HOST=<rds-endpoint>
  DATABASE_PORT=5432
  DATABASE_NAME=marketing_platform
  DATABASE_USERNAME=<from-secrets>
  DATABASE_PASSWORD=<from-secrets>
  DATABASE_SSL=true
  DATABASE_CA_CERT=<path-to-rds-ca-bundle>

  # Redis
  REDIS_HOST=<elasticache-endpoint>
  REDIS_PORT=6379
  REDIS_PASSWORD=<from-secrets>
  REDIS_TLS=true

  # RabbitMQ
  RABBITMQ_URL=amqps://<amazonmq-endpoint>

  # JWT (64+ character random strings)
  JWT_ACCESS_SECRET=<generate-random>
  JWT_REFRESH_SECRET=<generate-random>
  JWT_ACCESS_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=7d

  # AWS SES
  AWS_REGION=us-east-1
  AWS_ACCESS_KEY_ID=<iam-role-or-key>
  AWS_SECRET_ACCESS_KEY=<from-secrets>
  SES_FROM_EMAIL=noreply@yourdomain.com
  SES_CONFIGURATION_SET=marketing-tracking

  # Twilio
  TWILIO_ACCOUNT_SID=<from-secrets>
  TWILIO_AUTH_TOKEN=<from-secrets>
  TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
  TWILIO_MESSAGING_SERVICE_SID=<optional>

  # Stripe
  STRIPE_SECRET_KEY=<from-secrets>
  STRIPE_PUBLISHABLE_KEY=pk_live_xxx
  STRIPE_WEBHOOK_SECRET=<from-secrets>

  # Rate Limiting
  THROTTLE_TTL=60
  THROTTLE_LIMIT=100
  TWILIO_RATE_LIMIT=100

  # Google OAuth
  GOOGLE_CLIENT_ID=<from-google-console>
  GOOGLE_CLIENT_SECRET=<from-secrets>
  GOOGLE_CALLBACK_URL=https://api.yourdomain.com/api/v1/auth/google/callback

  # Compliance
  SMS_COMPLIANCE_ENABLED=true
  SMS_COMPLIANCE_STRICT_MODE=false
  ```

---

### Phase 5: Security Hardening

- [ ] **5.1 API Security**
  - [ ] Verify Helmet.js is configured
  - [ ] Configure CORS for production domain only
  - [ ] Add body size limits (10MB)
  - [ ] Disable Swagger in production OR add authentication
  - [ ] Verify all endpoints have proper authentication

- [ ] **5.2 Network Security**
  - [ ] Configure security groups (minimal access)
  - [ ] Set up VPC with private subnets for database/cache
  - [ ] Enable VPC Flow Logs
  - [ ] Configure NAT Gateway for outbound internet

- [ ] **5.3 Monitoring & Alerting**
  - [ ] Set up CloudWatch alarms:
    - [ ] High CPU (>80%)
    - [ ] High memory (>80%)
    - [ ] 5xx error rate (>1%)
    - [ ] Database connections (>80%)
    - [ ] Queue depth (>10,000)
  - [ ] Configure Sentry for error tracking
  - [ ] Set up uptime monitoring

---

### Phase 6: Testing

- [ ] **6.1 Staging Environment**
  - [ ] Deploy to staging environment
  - [ ] Run all unit tests
  - [ ] Run all e2e tests
  - [ ] Perform manual testing of critical flows

- [ ] **6.2 Integration Testing**
  - [ ] Test user registration (email/Google OAuth)
  - [ ] Test email campaign creation and sending
  - [ ] Test SMS campaign creation and sending
  - [ ] Test webhook delivery (SES, Twilio, Stripe)
  - [ ] Test billing flow (subscription, wallet top-up)
  - [ ] Test tracking (email opens, clicks, unsubscribes)

- [ ] **6.3 Load Testing**
  - [ ] Run SMS load test (10,000 messages)
  - [ ] Verify throughput meets requirements (10K/min)
  - [ ] Monitor for memory leaks
  - [ ] Check database connection pool

- [ ] **6.4 Security Testing**
  - [ ] Run OWASP ZAP scan
  - [ ] Test rate limiting effectiveness
  - [ ] Verify tenant isolation
  - [ ] Test webhook signature verification

---

### Phase 7: Deployment

- [ ] **7.1 Pre-Deployment**
  - [ ] Create deployment runbook
  - [ ] Schedule maintenance window (if needed)
  - [ ] Notify stakeholders
  - [ ] Prepare rollback plan

- [ ] **7.2 Deployment Steps**
  - [ ] Run database migrations
  - [ ] Deploy API service
  - [ ] Deploy web frontend
  - [ ] Verify health checks pass
  - [ ] Run smoke tests

- [ ] **7.3 Post-Deployment**
  - [ ] Monitor error rates
  - [ ] Monitor latency
  - [ ] Monitor queue depths
  - [ ] Verify webhook endpoints responding
  - [ ] Test critical user flows

---

### Phase 8: Documentation

- [ ] **8.1 Internal Documentation**
  - [ ] Update API documentation
  - [ ] Document environment variables
  - [ ] Document deployment process
  - [ ] Create incident response runbook

- [ ] **8.2 External Documentation**
  - [ ] Create user onboarding guide
  - [ ] Document API for customers (if applicable)
  - [ ] Create FAQ for common issues

---

## Post-Deployment Tasks

- [ ] Implement password reset functionality
- [ ] Complete API keys module
- [ ] Add comprehensive audit logging
- [ ] Implement token revocation list
- [ ] Set up regular security scans
- [ ] Plan WhatsApp integration

---

## Rollback Plan

1. **Database Rollback**
   - Keep previous migration state documented
   - Have rollback migration scripts ready

2. **Application Rollback**
   - Maintain previous Docker image tags
   - ECS/Kubernetes: revert to previous task definition

3. **Emergency Contacts**
   - On-call engineer: [TBD]
   - Database admin: [TBD]
   - AWS support: [TBD]

---

## Sign-Off

| Role      | Name | Date | Signature |
| --------- | ---- | ---- | --------- |
| Tech Lead |      |      |           |
| Security  |      |      |           |
| DevOps    |      |      |           |
| QA        |      |      |           |
