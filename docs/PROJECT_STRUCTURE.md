# PROJECT STRUCTURE - MARKETING AUTOMATION PLATFORM

## Overview

This document outlines the complete project structure following modern best practices for scalability, maintainability, and clean code architecture.

---

## Root Structure

```
marketing-platform/
├── apps/
│   ├── api/                    # NestJS Backend
│   └── web/                    # Next.js Frontend
├── packages/
│   ├── shared/                 # Shared types, utils, constants
│   ├── ui/                     # Shared UI components (future)
│   └── config/                 # Shared configs (ESLint, TS, etc.)
├── docker/                     # Docker configurations
├── docs/                       # Documentation
├── scripts/                    # Build & deployment scripts
├── .github/                    # GitHub Actions workflows
├── turbo.json                  # Turborepo configuration
├── package.json                # Root package.json (workspaces)
├── pnpm-workspace.yaml         # PNPM workspaces
└── README.md
```

---

## Backend Structure (apps/api)

```
apps/api/
├── src/
│   ├── main.ts                         # Application entry point
│   ├── app.module.ts                   # Root module
│   │
│   ├── common/                         # Shared utilities & base classes
│   │   ├── constants/
│   │   │   ├── index.ts
│   │   │   ├── app.constants.ts
│   │   │   ├── queue.constants.ts      # RabbitMQ queue names
│   │   │   └── events.constants.ts     # Event names
│   │   │
│   │   ├── decorators/
│   │   │   ├── index.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   ├── current-tenant.decorator.ts
│   │   │   ├── roles.decorator.ts
│   │   │   └── api-paginated.decorator.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── index.ts
│   │   │   ├── pagination.dto.ts
│   │   │   ├── sort.dto.ts
│   │   │   └── response.dto.ts
│   │   │
│   │   ├── entities/
│   │   │   └── base.entity.ts          # Base entity with common fields
│   │   │
│   │   ├── enums/
│   │   │   ├── index.ts
│   │   │   ├── role.enum.ts
│   │   │   ├── campaign-status.enum.ts
│   │   │   ├── contact-status.enum.ts
│   │   │   └── message-status.enum.ts
│   │   │
│   │   ├── exceptions/
│   │   │   ├── index.ts
│   │   │   ├── business.exception.ts
│   │   │   └── validation.exception.ts
│   │   │
│   │   ├── filters/
│   │   │   ├── index.ts
│   │   │   ├── http-exception.filter.ts
│   │   │   └── all-exceptions.filter.ts
│   │   │
│   │   ├── guards/
│   │   │   ├── index.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   ├── tenant.guard.ts
│   │   │   └── api-key.guard.ts
│   │   │
│   │   ├── interceptors/
│   │   │   ├── index.ts
│   │   │   ├── logging.interceptor.ts
│   │   │   ├── transform.interceptor.ts
│   │   │   ├── timeout.interceptor.ts
│   │   │   └── tenant.interceptor.ts
│   │   │
│   │   ├── interfaces/
│   │   │   ├── index.ts
│   │   │   ├── request.interface.ts
│   │   │   └── paginated.interface.ts
│   │   │
│   │   ├── middleware/
│   │   │   ├── index.ts
│   │   │   ├── logger.middleware.ts
│   │   │   └── tenant.middleware.ts
│   │   │
│   │   ├── pipes/
│   │   │   ├── index.ts
│   │   │   ├── validation.pipe.ts
│   │   │   └── parse-uuid.pipe.ts
│   │   │
│   │   └── utils/
│   │       ├── index.ts
│   │       ├── hash.util.ts
│   │       ├── string.util.ts
│   │       ├── date.util.ts
│   │       └── pagination.util.ts
│   │
│   ├── config/                         # Configuration management
│   │   ├── index.ts
│   │   ├── configuration.ts            # Main config factory
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── rabbitmq.config.ts
│   │   ├── jwt.config.ts
│   │   ├── aws.config.ts
│   │   ├── twilio.config.ts
│   │   └── stripe.config.ts
│   │
│   ├── database/                       # Database management
│   │   ├── database.module.ts
│   │   ├── migrations/                 # TypeORM migrations
│   │   │   ├── 1704000000000-CreateTenants.ts
│   │   │   ├── 1704000000001-CreateUsers.ts
│   │   │   ├── 1704000000002-CreateContacts.ts
│   │   │   └── ...
│   │   ├── seeds/                      # Database seeders
│   │   │   ├── seed.ts
│   │   │   ├── plans.seed.ts
│   │   │   └── templates.seed.ts
│   │   └── data-source.ts              # TypeORM data source
│   │
│   ├── modules/                        # Feature modules
│   │   │
│   │   ├── auth/                       # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── index.ts
│   │   │   │   ├── register.dto.ts
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── refresh-token.dto.ts
│   │   │   │   ├── forgot-password.dto.ts
│   │   │   │   └── reset-password.dto.ts
│   │   │   ├── strategies/
│   │   │   │   ├── jwt.strategy.ts
│   │   │   │   ├── jwt-refresh.strategy.ts
│   │   │   │   └── google.strategy.ts
│   │   │   └── guards/
│   │   │       └── google-auth.guard.ts
│   │   │
│   │   ├── users/                      # User management
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.repository.ts
│   │   │   ├── dto/
│   │   │   │   ├── index.ts
│   │   │   │   ├── create-user.dto.ts
│   │   │   │   ├── update-user.dto.ts
│   │   │   │   └── invite-user.dto.ts
│   │   │   └── entities/
│   │   │       └── user.entity.ts
│   │   │
│   │   ├── tenants/                    # Multi-tenant management
│   │   │   ├── tenants.module.ts
│   │   │   ├── tenants.controller.ts
│   │   │   ├── tenants.service.ts
│   │   │   ├── tenants.repository.ts
│   │   │   ├── dto/
│   │   │   │   ├── index.ts
│   │   │   │   ├── create-tenant.dto.ts
│   │   │   │   └── update-tenant.dto.ts
│   │   │   └── entities/
│   │   │       └── tenant.entity.ts
│   │   │
│   │   ├── contacts/                   # Contact management
│   │   │   ├── contacts.module.ts
│   │   │   ├── contacts.controller.ts
│   │   │   ├── contacts.service.ts
│   │   │   ├── contacts.repository.ts
│   │   │   ├── dto/
│   │   │   │   ├── index.ts
│   │   │   │   ├── create-contact.dto.ts
│   │   │   │   ├── update-contact.dto.ts
│   │   │   │   ├── import-contacts.dto.ts
│   │   │   │   └── filter-contacts.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── contact.entity.ts
│   │   │   │   ├── contact-list.entity.ts
│   │   │   │   └── contact-list-member.entity.ts
│   │   │   └── services/
│   │   │       ├── contact-import.service.ts
│   │   │       └── contact-export.service.ts
│   │   │
│   │   ├── campaigns/                  # Campaign management
│   │   │   ├── campaigns.module.ts
│   │   │   ├── campaigns.controller.ts
│   │   │   ├── campaigns.service.ts
│   │   │   ├── campaigns.repository.ts
│   │   │   ├── dto/
│   │   │   │   ├── index.ts
│   │   │   │   ├── create-campaign.dto.ts
│   │   │   │   ├── update-campaign.dto.ts
│   │   │   │   ├── schedule-campaign.dto.ts
│   │   │   │   └── filter-campaigns.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── campaign.entity.ts
│   │   │   │   ├── campaign-message.entity.ts
│   │   │   │   └── campaign-event.entity.ts
│   │   │   └── services/
│   │   │       ├── campaign-scheduler.service.ts
│   │   │       └── campaign-stats.service.ts
│   │   │
│   │   ├── templates/                  # Email templates
│   │   │   ├── templates.module.ts
│   │   │   ├── templates.controller.ts
│   │   │   ├── templates.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-template.dto.ts
│   │   │   │   └── update-template.dto.ts
│   │   │   └── entities/
│   │   │       └── email-template.entity.ts
│   │   │
│   │   ├── billing/                    # Billing & subscriptions
│   │   │   ├── billing.module.ts
│   │   │   ├── billing.controller.ts
│   │   │   ├── billing.service.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-subscription.dto.ts
│   │   │   │   └── change-plan.dto.ts
│   │   │   ├── entities/
│   │   │   │   ├── plan.entity.ts
│   │   │   │   ├── subscription.entity.ts
│   │   │   │   └── usage-record.entity.ts
│   │   │   └── services/
│   │   │       ├── stripe.service.ts
│   │   │       └── usage-tracking.service.ts
│   │   │
│   │   ├── analytics/                  # Analytics & reporting
│   │   │   ├── analytics.module.ts
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   └── dto/
│   │   │       ├── dashboard.dto.ts
│   │   │       └── report.dto.ts
│   │   │
│   │   ├── webhooks/                   # Webhook handling
│   │   │   ├── webhooks.module.ts
│   │   │   ├── webhooks.controller.ts
│   │   │   ├── handlers/
│   │   │   │   ├── ses-webhook.handler.ts
│   │   │   │   ├── twilio-webhook.handler.ts
│   │   │   │   └── stripe-webhook.handler.ts
│   │   │   └── dto/
│   │   │       └── webhook-config.dto.ts
│   │   │
│   │   └── api-keys/                   # API key management
│   │       ├── api-keys.module.ts
│   │       ├── api-keys.controller.ts
│   │       ├── api-keys.service.ts
│   │       ├── dto/
│   │       │   └── create-api-key.dto.ts
│   │       └── entities/
│   │           └── api-key.entity.ts
│   │
│   ├── providers/                      # External service providers
│   │   │
│   │   ├── email/                      # Email providers
│   │   │   ├── email.module.ts
│   │   │   ├── email.service.ts         # Abstract email service
│   │   │   ├── providers/
│   │   │   │   ├── ses.provider.ts      # AWS SES implementation
│   │   │   │   └── sendgrid.provider.ts # SendGrid fallback
│   │   │   └── interfaces/
│   │   │       └── email-provider.interface.ts
│   │   │
│   │   ├── sms/                        # SMS providers
│   │   │   ├── sms.module.ts
│   │   │   ├── sms.service.ts
│   │   │   └── providers/
│   │   │       └── twilio-sms.provider.ts
│   │   │
│   │   ├── whatsapp/                   # WhatsApp providers
│   │   │   ├── whatsapp.module.ts
│   │   │   ├── whatsapp.service.ts
│   │   │   └── providers/
│   │   │       └── twilio-whatsapp.provider.ts
│   │   │
│   │   └── storage/                    # File storage
│   │       ├── storage.module.ts
│   │       ├── storage.service.ts
│   │       └── providers/
│   │           └── s3.provider.ts
│   │
│   ├── queue/                          # RabbitMQ queue management
│   │   ├── queue.module.ts
│   │   │
│   │   ├── producers/                  # Job publishers
│   │   │   ├── index.ts
│   │   │   ├── email.producer.ts
│   │   │   ├── sms.producer.ts
│   │   │   ├── whatsapp.producer.ts
│   │   │   ├── import.producer.ts
│   │   │   └── webhook.producer.ts
│   │   │
│   │   ├── consumers/                  # Job processors
│   │   │   ├── index.ts
│   │   │   ├── email.consumer.ts
│   │   │   ├── sms.consumer.ts
│   │   │   ├── whatsapp.consumer.ts
│   │   │   ├── import.consumer.ts
│   │   │   └── webhook.consumer.ts
│   │   │
│   │   └── listeners/                  # Event listeners
│   │       ├── index.ts
│   │       ├── analytics.listener.ts
│   │       ├── notification.listener.ts
│   │       └── automation.listener.ts
│   │
│   └── health/                         # Health checks
│       ├── health.module.ts
│       └── health.controller.ts
│
├── test/                               # Tests
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── .env.example
├── .env.development
├── .env.production
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── README.md
```

---

## Frontend Structure (apps/web)

```
apps/web/
├── public/
│   ├── images/
│   │   ├── logo.svg
│   │   ├── logo-dark.svg
│   │   └── og-image.png
│   ├── fonts/
│   │   └── geist/
│   └── favicon.ico
│
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                    # Landing page
│   │   ├── loading.tsx                 # Global loading
│   │   ├── error.tsx                   # Global error
│   │   ├── not-found.tsx               # 404 page
│   │   ├── globals.css                 # Global styles
│   │   │
│   │   ├── (marketing)/                # Marketing pages (public)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                # Home
│   │   │   ├── pricing/
│   │   │   │   └── page.tsx
│   │   │   ├── features/
│   │   │   │   └── page.tsx
│   │   │   ├── about/
│   │   │   │   └── page.tsx
│   │   │   └── contact/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (auth)/                     # Authentication pages
│   │   │   ├── layout.tsx
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   └── verify-email/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (dashboard)/                # Dashboard (protected)
│   │   │   ├── layout.tsx              # Dashboard layout with sidebar
│   │   │   ├── page.tsx                # Dashboard home
│   │   │   │
│   │   │   ├── contacts/
│   │   │   │   ├── page.tsx            # Contacts list
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx        # Contact detail
│   │   │   │   ├── import/
│   │   │   │   │   └── page.tsx        # Import contacts
│   │   │   │   └── lists/
│   │   │   │       ├── page.tsx        # Contact lists
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx    # List detail
│   │   │   │
│   │   │   ├── campaigns/
│   │   │   │   ├── page.tsx            # Campaigns list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx        # Create campaign
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx        # Campaign detail
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx    # Edit campaign
│   │   │   │
│   │   │   ├── templates/
│   │   │   │   ├── page.tsx            # Templates list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx        # Create template
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx        # Edit template
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── page.tsx            # Analytics dashboard
│   │   │   │   └── reports/
│   │   │   │       └── page.tsx        # Reports
│   │   │   │
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx            # Settings overview
│   │   │   │   ├── profile/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── team/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── billing/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── api-keys/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── notifications/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   └── onboarding/
│   │   │       └── page.tsx            # New user onboarding
│   │   │
│   │   └── api/                        # API routes
│   │       └── auth/
│   │           └── [...nextauth]/
│   │               └── route.ts
│   │
│   ├── components/                     # React components
│   │   │
│   │   ├── ui/                         # Base UI components (shadcn/ui)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── label.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── toaster.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── command.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── date-picker.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── layout/                     # Layout components
│   │   │   ├── header.tsx              # Main header
│   │   │   ├── footer.tsx              # Main footer
│   │   │   ├── sidebar.tsx             # Dashboard sidebar
│   │   │   ├── mobile-nav.tsx          # Mobile navigation
│   │   │   ├── breadcrumb.tsx          # Breadcrumb navigation
│   │   │   ├── page-header.tsx         # Page header with title
│   │   │   └── index.ts
│   │   │
│   │   ├── forms/                      # Form components
│   │   │   ├── form-field.tsx          # Reusable form field
│   │   │   ├── form-select.tsx
│   │   │   ├── form-checkbox.tsx
│   │   │   ├── form-date-picker.tsx
│   │   │   ├── tag-input.tsx           # Tag input for contacts
│   │   │   ├── file-upload.tsx         # File upload component
│   │   │   └── index.ts
│   │   │
│   │   ├── data-display/               # Data display components
│   │   │   ├── data-table.tsx          # Advanced data table
│   │   │   ├── data-table-toolbar.tsx
│   │   │   ├── data-table-pagination.tsx
│   │   │   ├── stats-card.tsx          # Statistics card
│   │   │   ├── chart-card.tsx          # Chart wrapper
│   │   │   ├── empty-state.tsx         # Empty state placeholder
│   │   │   ├── loading-state.tsx       # Loading placeholder
│   │   │   └── index.ts
│   │   │
│   │   ├── feedback/                   # Feedback components
│   │   │   ├── loading-spinner.tsx
│   │   │   ├── loading-dots.tsx
│   │   │   ├── loading-skeleton.tsx
│   │   │   ├── error-boundary.tsx
│   │   │   ├── confirmation-dialog.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── marketing/                  # Marketing page components
│   │   │   ├── hero.tsx
│   │   │   ├── features.tsx
│   │   │   ├── pricing-cards.tsx
│   │   │   ├── testimonials.tsx
│   │   │   ├── cta-section.tsx
│   │   │   ├── faq.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── auth/                       # Auth components
│   │   │   ├── login-form.tsx
│   │   │   ├── register-form.tsx
│   │   │   ├── forgot-password-form.tsx
│   │   │   ├── social-auth-buttons.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── contacts/                   # Contact-specific components
│   │   │   ├── contact-table.tsx
│   │   │   ├── contact-form.tsx
│   │   │   ├── contact-card.tsx
│   │   │   ├── contact-import-wizard.tsx
│   │   │   ├── contact-filters.tsx
│   │   │   ├── contact-tags.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── campaigns/                  # Campaign-specific components
│   │   │   ├── campaign-table.tsx
│   │   │   ├── campaign-form.tsx
│   │   │   ├── campaign-card.tsx
│   │   │   ├── campaign-stats.tsx
│   │   │   ├── campaign-status-badge.tsx
│   │   │   ├── email-composer/
│   │   │   │   ├── email-editor.tsx
│   │   │   │   ├── email-preview.tsx
│   │   │   │   ├── template-selector.tsx
│   │   │   │   └── personalization-tokens.tsx
│   │   │   ├── sms-composer/
│   │   │   │   ├── sms-editor.tsx
│   │   │   │   └── character-counter.tsx
│   │   │   └── index.ts
│   │   │
│   │   ├── analytics/                  # Analytics components
│   │   │   ├── overview-chart.tsx
│   │   │   ├── engagement-chart.tsx
│   │   │   ├── device-breakdown.tsx
│   │   │   ├── geographic-map.tsx
│   │   │   ├── metric-card.tsx
│   │   │   └── index.ts
│   │   │
│   │   └── settings/                   # Settings components
│   │       ├── profile-form.tsx
│   │       ├── team-members-table.tsx
│   │       ├── invite-member-dialog.tsx
│   │       ├── billing-info.tsx
│   │       ├── api-keys-table.tsx
│   │       └── index.ts
│   │
│   ├── lib/                            # Utility libraries
│   │   ├── api/                        # API client
│   │   │   ├── client.ts               # Axios/Fetch client
│   │   │   ├── auth.api.ts
│   │   │   ├── contacts.api.ts
│   │   │   ├── campaigns.api.ts
│   │   │   ├── templates.api.ts
│   │   │   ├── analytics.api.ts
│   │   │   ├── billing.api.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── utils/                      # Utility functions
│   │   │   ├── cn.ts                   # Class name merger
│   │   │   ├── format.ts               # Formatting helpers
│   │   │   ├── date.ts                 # Date utilities
│   │   │   ├── validation.ts           # Validation helpers
│   │   │   └── index.ts
│   │   │
│   │   ├── hooks/                      # Custom React hooks
│   │   │   ├── use-auth.ts
│   │   │   ├── use-user.ts
│   │   │   ├── use-tenant.ts
│   │   │   ├── use-contacts.ts
│   │   │   ├── use-campaigns.ts
│   │   │   ├── use-debounce.ts
│   │   │   ├── use-local-storage.ts
│   │   │   ├── use-media-query.ts
│   │   │   ├── use-toast.ts
│   │   │   └── index.ts
│   │   │
│   │   └── config/                     # Frontend config
│   │       ├── site.ts                 # Site metadata
│   │       ├── navigation.ts           # Navigation config
│   │       └── index.ts
│   │
│   ├── store/                          # State management (Zustand)
│   │   ├── auth.store.ts
│   │   ├── user.store.ts
│   │   ├── ui.store.ts                 # UI state (sidebar, theme)
│   │   └── index.ts
│   │
│   ├── styles/                         # Styles
│   │   ├── themes/
│   │   │   ├── light.css
│   │   │   └── dark.css
│   │   └── animations.css              # Custom animations
│   │
│   ├── types/                          # TypeScript types
│   │   ├── api.types.ts                # API response types
│   │   ├── auth.types.ts
│   │   ├── contact.types.ts
│   │   ├── campaign.types.ts
│   │   ├── template.types.ts
│   │   ├── analytics.types.ts
│   │   └── index.ts
│   │
│   └── providers/                      # React context providers
│       ├── auth-provider.tsx
│       ├── theme-provider.tsx
│       ├── query-provider.tsx          # TanStack Query
│       ├── toast-provider.tsx
│       └── index.tsx
│
├── .env.example
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── components.json                     # shadcn/ui config
├── package.json
└── README.md
```

---

## Shared Package Structure (packages/shared)

```
packages/shared/
├── src/
│   ├── types/                          # Shared TypeScript types
│   │   ├── user.types.ts
│   │   ├── tenant.types.ts
│   │   ├── contact.types.ts
│   │   ├── campaign.types.ts
│   │   ├── template.types.ts
│   │   ├── billing.types.ts
│   │   ├── api-response.types.ts
│   │   └── index.ts
│   │
│   ├── constants/                      # Shared constants
│   │   ├── roles.ts
│   │   ├── plans.ts
│   │   ├── limits.ts
│   │   └── index.ts
│   │
│   ├── utils/                          # Shared utilities
│   │   ├── validation.ts
│   │   ├── format.ts
│   │   └── index.ts
│   │
│   └── index.ts                        # Main export
│
├── package.json
└── tsconfig.json
```

---

## Design System & UI Guidelines

### Color Palette

```css
/* Light Theme */
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--card: 0 0% 100%;
--card-foreground: 222.2 84% 4.9%;
--popover: 0 0% 100%;
--popover-foreground: 222.2 84% 4.9%;
--primary: 221.2 83.2% 53.3%; /* Blue - Main brand */
--primary-foreground: 210 40% 98%;
--secondary: 210 40% 96.1%;
--secondary-foreground: 222.2 47.4% 11.2%;
--muted: 210 40% 96.1%;
--muted-foreground: 215.4 16.3% 46.9%;
--accent: 210 40% 96.1%;
--accent-foreground: 222.2 47.4% 11.2%;
--destructive: 0 84.2% 60.2%; /* Red - Errors */
--destructive-foreground: 210 40% 98%;
--success: 142 76% 36%; /* Green - Success */
--warning: 38 92% 50%; /* Yellow - Warning */
--border: 214.3 31.8% 91.4%;
--input: 214.3 31.8% 91.4%;
--ring: 221.2 83.2% 53.3%;
--radius: 0.5rem;
```

### Typography

```css
/* Font Family */
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Font Sizes */
--text-xs: 0.75rem; /* 12px */
--text-sm: 0.875rem; /* 14px */
--text-base: 1rem; /* 16px */
--text-lg: 1.125rem; /* 18px */
--text-xl: 1.25rem; /* 20px */
--text-2xl: 1.5rem; /* 24px */
--text-3xl: 1.875rem; /* 30px */
--text-4xl: 2.25rem; /* 36px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing System

```css
/* Based on 4px grid */
--space-0: 0;
--space-1: 0.25rem; /* 4px */
--space-2: 0.5rem; /* 8px */
--space-3: 0.75rem; /* 12px */
--space-4: 1rem; /* 16px */
--space-5: 1.25rem; /* 20px */
--space-6: 1.5rem; /* 24px */
--space-8: 2rem; /* 32px */
--space-10: 2.5rem; /* 40px */
--space-12: 3rem; /* 48px */
--space-16: 4rem; /* 64px */
--space-20: 5rem; /* 80px */
--space-24: 6rem; /* 96px */
```

### Animation Standards

```css
/* Durations */
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;

/* Easings */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);

/* Common Animations */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

---

## Code Style Guidelines

### TypeScript Standards

```typescript
// Use explicit return types for functions
function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Use interfaces for objects
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

// Use type for unions/intersections
type Status = 'pending' | 'active' | 'completed' | 'failed';

// Use const assertions for constants
const ROLES = ['owner', 'admin', 'member'] as const;
type Role = (typeof ROLES)[number];

// Prefer async/await over .then()
async function fetchUser(id: string): Promise<User> {
  const response = await api.get(`/users/${id}`);
  return response.data;
}

// Use destructuring
const { firstName, lastName, email } = user;

// Use optional chaining
const city = user?.address?.city;

// Use nullish coalescing
const name = user.nickname ?? user.firstName;
```

### React Component Standards

```tsx
// Use function components with TypeScript
interface ButtonProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({
  variant = 'default',
  size = 'md',
  isLoading = false,
  children,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        variants[variant],
        sizes[size],
        isLoading && 'cursor-not-allowed opacity-50'
      )}
      disabled={isLoading}
      onClick={onClick}
    >
      {isLoading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
}
```

### File Naming Conventions

```
# Components: PascalCase
Button.tsx
ContactTable.tsx
CampaignForm.tsx

# Hooks: camelCase with 'use' prefix
useAuth.ts
useContacts.ts
useLocalStorage.ts

# Utilities: camelCase
formatDate.ts
validation.ts

# Types: camelCase with '.types' suffix
user.types.ts
campaign.types.ts

# Constants: camelCase with '.constants' suffix
app.constants.ts
queue.constants.ts

# API: camelCase with '.api' suffix
contacts.api.ts
campaigns.api.ts
```

### Import Order

```typescript
// 1. React/Next.js imports
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party imports
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 3. Local imports - absolute paths
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/hooks/use-auth';

// 4. Local imports - relative paths
import { ContactForm } from './contact-form';
import type { Contact } from './types';

// 5. Style imports
import styles from './styles.module.css';
```

---

## Next Steps

Run these commands to initialize the project:

```bash
# Create project directory
mkdir marketing-platform && cd marketing-platform

# Initialize with pnpm workspaces
pnpm init

# Create workspace structure
mkdir -p apps/api apps/web packages/shared packages/config

# Initialize each app
cd apps/api && nest new . --skip-git
cd ../web && npx create-next-app@latest . --typescript --tailwind --app

# Install shared dependencies
pnpm add -w turbo typescript @types/node
```
