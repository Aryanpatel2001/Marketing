# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant marketing automation platform for Email, SMS, and WhatsApp campaigns. Built as a Turborepo monorepo with NestJS backend and Next.js frontend.

## Commands

### Development

```bash
npm run dev           # Start all apps (API on :3000, Web on :3001)
npm run dev:api       # Start only API
npm run dev:web       # Start only Web
npm run build         # Build all apps
npm run lint          # Lint all apps
npm run format        # Format with Prettier
```

### Testing

```bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:cov      # Coverage report
npm run test:e2e      # E2E tests (API)
```

### Database (from root)

```bash
npm run db:migrate              # Run migrations
npm run db:migrate:create       # Create new migration
npm run db:seed                 # Seed test data
```

### API-specific (from apps/api)

```bash
npm run migration:generate -- -n MigrationName  # Generate migration from entities
npm run start:debug                             # Debug mode with inspector
```

## Architecture

### Monorepo Structure

- `apps/api` - NestJS backend (TypeORM, PostgreSQL, RabbitMQ, Redis)
- `apps/web` - Next.js 14 frontend (App Router, Shadcn/ui, React Query, Zustand)
- `packages/shared` - Shared types, constants, utilities (`@marketing-platform/shared`)

### Backend Architecture

**Module Pattern**: Feature modules in `apps/api/src/modules/` with controllers, services, entities, DTOs.

**Provider Layer**: Abstracted external integrations in `apps/api/src/providers/`:

- `sms/` - SMS via Twilio (implements `SmsProvider` abstract class)
- `email/` - Email via AWS SES or SendGrid
- `queue/` - RabbitMQ message queuing
- `redis/` - Caching and counters
- `storage/` - Cloudinary and S3

**Queue-Based Processing**: Campaigns use RabbitMQ workers for async message sending:

1. Campaign send triggers `*-prepare.worker` → creates message records per recipient
2. Messages published to `*.send.queue` → processed by `*-send.worker`
3. Failed messages go to `*.retry.queue` with exponential backoff
4. Delivery webhooks update message status via tracking services

Queue definitions in `apps/api/src/providers/queue/queue.constants.ts` define exchanges, routing keys, and message interfaces.

**Multi-Tenancy**: All database queries scoped by `tenantId`. JWT auth provides tenant context.

### Frontend Architecture

**Routing**: Next.js App Router with route groups:

- `(auth)/` - Login, register, password reset
- `(dashboard)/` - Protected routes (campaigns, contacts, templates, settings)

**Data Fetching**: React Query for server state, Zustand for client state.

**UI**: Shadcn/ui components in `apps/web/src/components/ui/`. Feature components organized by domain.

**API Client**: Axios wrapper in `apps/web/src/lib/api/` with domain-specific modules.

### Campaign Processing Flow

```
User creates campaign → API validates & queues
    ↓
RabbitMQ: *.campaign.prepare routing key
    ↓
PrepareWorker: Creates CampaignMessage records for each recipient
    ↓
RabbitMQ: *.message.send routing key
    ↓
SendWorker: Calls provider (Twilio/SES) → Updates status
    ↓
Provider webhook → TrackingService → Updates delivery status
```

## Key Patterns

### Adding New Providers

Implement the abstract provider class (e.g., `SmsProvider` in `sms-provider.interface.ts`), register in module, inject where needed.

### Adding New Campaign Channels

1. Create workers in `apps/api/src/modules/campaigns/workers/`
2. Add queue definitions in `queue.constants.ts`
3. Extend `CampaignSendService` for the new channel

### API Validation

DTOs use `class-validator` decorators. Global validation pipe enabled.

### Path Aliases

API uses `@/` alias for `apps/api/src/` (configured in tsconfig).

## Infrastructure Requirements

- PostgreSQL (default port 5433)
- Redis
- RabbitMQ
- External accounts: Twilio (SMS), AWS SES or SendGrid (Email), Stripe (Billing)
