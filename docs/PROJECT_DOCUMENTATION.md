# Marketing Platform - Complete Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Backend (NestJS)](#2-backend-nestjs)
3. [Frontend (Next.js)](#3-frontend-nextjs)
4. [Complete Request Flow](#4-complete-request-flow)
5. [What's Built vs Not Built](#5-whats-built-vs-not-built)
6. [Key Files Summary](#6-key-files-summary)

---

## 1. Project Overview

This is a **Multi-Channel Marketing Automation Platform** that allows users to create and manage Email, SMS, and WhatsApp campaigns. It's built as a **monorepo** with:

```
markeing-sms/
├── apps/
│   ├── api/          ← Backend (NestJS) - Port 3000
│   └── web/          ← Frontend (Next.js) - Port 3001
├── packages/
│   └── shared/       ← Shared types, constants
├── docker-compose.yml
└── package.json
```

### Tech Stack

| Layer            | Technology                     |
| ---------------- | ------------------------------ |
| Backend          | NestJS, TypeORM, PostgreSQL    |
| Frontend         | Next.js 14, React, TailwindCSS |
| State Management | Zustand, TanStack Query        |
| Authentication   | JWT, Passport.js, Google OAuth |
| Database         | PostgreSQL (Docker)            |
| Cache            | Redis (Docker)                 |
| Queue            | RabbitMQ (Docker)              |
| UI Components    | shadcn/ui, Radix UI            |

### Running the Project

```bash
# Start Docker services (PostgreSQL, Redis, RabbitMQ)
docker-compose up -d

# Install dependencies
npm install

# Start both frontend and backend
npm run dev
```

- Backend API: http://localhost:3000
- Frontend App: http://localhost:3001
- API Docs: http://localhost:3000/docs

---

## 2. Backend (NestJS)

### 2.1 Directory Structure

```
apps/api/src/
├── main.ts                    # Entry point - starts server
├── app.module.ts              # Root module - imports all modules
├── config/
│   ├── configuration.ts       # Environment config
│   └── database.config.ts     # TypeORM config
├── common/
│   ├── entities/              # Base entities
│   ├── decorators/            # @CurrentUser, @CurrentTenant, @Public
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── filters/               # Exception filters
│   └── interceptors/          # Response transformers
├── modules/
│   ├── auth/                  # Authentication (COMPLETE)
│   ├── users/                 # User management (COMPLETE)
│   ├── tenants/               # Multi-tenancy (COMPLETE)
│   ├── contacts/              # Contact management (COMPLETE)
│   ├── campaigns/             # Campaign management (EMPTY)
│   ├── templates/             # Email/SMS/WhatsApp templates (COMPLETE)
│   ├── billing/               # Stripe payments (EMPTY)
│   ├── analytics/             # Analytics (EMPTY)
│   ├── webhooks/              # Webhook handlers (EMPTY)
│   └── api-keys/              # API key management (EMPTY)
├── providers/
│   ├── email/                 # AWS SES, SendGrid
│   ├── sms/                   # Twilio SMS
│   ├── whatsapp/              # Twilio WhatsApp
│   └── storage/               # AWS S3
└── queue/                     # RabbitMQ consumers/producers
```

### 2.2 Entry Point - main.ts

**File:** `apps/api/src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security middleware
  app.use(helmet());

  // CORS - allows frontend to call API
  app.enableCors({
    origin: 'http://localhost:3001',
    credentials: true,
  });

  // All routes start with /api/v1
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'docs'],
  });

  // Validation - automatically validates incoming data
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw error for unknown properties
      transform: true, // Auto-transform types
    })
  );

  await app.listen(3000);
}

bootstrap();
```

### 2.3 App Module - app.module.ts

**File:** `apps/api/src/app.module.ts`

```typescript
@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({ isGlobal: true }),

    // Database (PostgreSQL via TypeORM)
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
    }),

    // Rate Limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Feature Modules
    AuthModule,
    UsersModule,
    TenantsModule,
    ContactsModule, // COMPLETE - Contact CRUD, import, lists
    CampaignsModule, // Empty - not implemented
    TemplatesModule, // COMPLETE - Email/SMS/WhatsApp templates
    BillingModule, // Empty - not implemented
    AnalyticsModule, // Empty - not implemented
    WebhooksModule, // Empty - not implemented
    ApiKeysModule, // Empty - not implemented

    // Provider Modules
    EmailModule,
    SmsModule,
    WhatsappModule,
    StorageModule,

    // Queue Module
    QueueModule,

    // Health Check
    HealthModule,
  ],
})
export class AppModule {}
```

### 2.4 Database Entities

#### Base Entity

**File:** `apps/api/src/common/entities/base.entity.ts`

```typescript
// Every table extends this base class
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string; // Auto-generated UUID

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date; // Auto-set on create

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date; // Auto-set on update
}

// Multi-tenant entities include tenant_id
export abstract class TenantBaseEntity extends BaseEntity {
  @Column({ name: 'tenant_id' })
  tenantId: string; // Links to specific tenant/workspace
}

// Entities with soft delete
export abstract class TenantSoftDeleteEntity extends TenantBaseEntity {
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null; // Soft delete timestamp
}
```

#### Tenant Entity

**File:** `apps/api/src/modules/tenants/entities/tenant.entity.ts`

**Table: `tenants`** - Each company/workspace is a tenant

| Column                 | Type         | Description                            |
| ---------------------- | ------------ | -------------------------------------- |
| id                     | UUID         | Primary key                            |
| name                   | VARCHAR(255) | Company name                           |
| slug                   | VARCHAR(100) | URL-friendly name (unique)             |
| domain                 | VARCHAR(255) | Custom domain (optional)               |
| logo                   | VARCHAR(255) | Logo URL                               |
| plan                   | ENUM         | FREE, STARTER, GROWTH, PRO, ENTERPRISE |
| status                 | ENUM         | ACTIVE, SUSPENDED, CANCELLED, TRIAL    |
| trial_ends_at          | TIMESTAMP    | Trial expiration date                  |
| stripe_customer_id     | VARCHAR(255) | Stripe customer ID                     |
| stripe_subscription_id | VARCHAR(255) | Stripe subscription ID                 |
| settings               | JSONB        | Custom settings                        |
| limits                 | JSONB        | maxContacts, maxEmails, maxSms, etc.   |
| billing_email          | VARCHAR(255) | Email for invoices                     |
| timezone               | VARCHAR(50)  | Tenant timezone                        |
| created_at             | TIMESTAMP    | Creation timestamp                     |
| updated_at             | TIMESTAMP    | Last update timestamp                  |

```typescript
@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  plan: SubscriptionPlan;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status: TenantStatus;

  @Column({ type: 'jsonb', default: {} })
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };
}
```

#### User Entity

**File:** `apps/api/src/modules/users/entities/user.entity.ts`

**Table: `users`** - System users

| Column                | Type         | Description                          |
| --------------------- | ------------ | ------------------------------------ |
| id                    | UUID         | Primary key                          |
| tenant_id             | UUID         | Foreign key to tenants               |
| email                 | VARCHAR(255) | User email (unique per tenant)       |
| password              | VARCHAR(255) | Bcrypt hashed password               |
| first_name            | VARCHAR(100) | First name                           |
| last_name             | VARCHAR(100) | Last name                            |
| avatar                | VARCHAR(255) | Profile picture URL                  |
| phone                 | VARCHAR(20)  | Phone number                         |
| role                  | ENUM         | OWNER, ADMIN, MEMBER, VIEWER         |
| status                | ENUM         | ACTIVE, INACTIVE, PENDING, SUSPENDED |
| auth_provider         | ENUM         | LOCAL, GOOGLE                        |
| google_id             | VARCHAR(255) | Google OAuth ID                      |
| email_verified        | BOOLEAN      | Is email verified                    |
| email_verified_at     | TIMESTAMP    | Email verification timestamp         |
| last_login_at         | TIMESTAMP    | Last login timestamp                 |
| last_login_ip         | VARCHAR(45)  | Last login IP address                |
| password_changed_at   | TIMESTAMP    | Last password change                 |
| failed_login_attempts | INT          | Failed login counter                 |
| locked_until          | TIMESTAMP    | Account lock expiration              |
| refresh_token_hash    | VARCHAR(255) | Hashed refresh token                 |
| preferences           | JSONB        | User preferences                     |
| created_at            | TIMESTAMP    | Creation timestamp                   |
| updated_at            | TIMESTAMP    | Last update timestamp                |
| deleted_at            | TIMESTAMP    | Soft delete timestamp                |

```typescript
@Entity('users')
@Index(['email', 'tenantId'], { unique: true })
export class User extends TenantSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude() // Never send to client
  password: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ name: 'auth_provider', type: 'enum', enum: AuthProvider, default: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  @Column({ name: 'refresh_token_hash', nullable: true })
  @Exclude() // Never send to client
  refreshTokenHash: string | null;

  // Auto-hash password before save
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  // Validate password
  async validatePassword(password: string): Promise<boolean> {
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
  }
}
```

### 2.5 Auth Module

#### Auth Controller

**File:** `apps/api/src/modules/auth/auth.controller.ts`

**API Endpoints:**

| Method | Route                          | Description               | Auth Required |
| ------ | ------------------------------ | ------------------------- | ------------- |
| POST   | `/api/v1/auth/register`        | Create new account        | No            |
| POST   | `/api/v1/auth/login`           | Login with email/password | No            |
| POST   | `/api/v1/auth/refresh`         | Get new access token      | No            |
| POST   | `/api/v1/auth/logout`          | Logout user               | Yes           |
| POST   | `/api/v1/auth/forgot-password` | Request password reset    | No            |
| POST   | `/api/v1/auth/reset-password`  | Reset password with token | No            |
| POST   | `/api/v1/auth/change-password` | Change current password   | Yes           |
| GET    | `/api/v1/auth/me`              | Get current user profile  | Yes           |
| GET    | `/api/v1/auth/google`          | Start Google OAuth        | No            |
| GET    | `/api/v1/auth/google/callback` | Google OAuth callback     | No            |

```typescript
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public() // No auth required
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    const ip = req.ip || req.socket.remoteAddress;
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @Public()
  async refreshTokens(@Body() dto: RefreshTokenDto): Promise<TokensDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@CurrentUser('id') userId: string): Promise<{ message: string }> {
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getProfile(@CurrentUser() user: User): Promise<User> {
    return user;
  }
}
```

#### Auth Service

**File:** `apps/api/src/modules/auth/auth.service.ts`

```typescript
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  // ==================== REGISTER ====================
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // 1. Validate terms acceptance
    if (!dto.acceptTerms) {
      throw new BadRequestException('You must accept the terms and conditions');
    }

    // 2. Check if email already exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // 3. Create tenant (workspace) for the user
    const tenant = await this.tenantsService.create({
      name: dto.companyName || `${dto.firstName}'s Workspace`,
      billingEmail: dto.email,
    });

    // 4. Create user as OWNER of tenant
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password, // Auto-hashed by entity
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantId: tenant.id,
      role: UserRole.OWNER,
      authProvider: AuthProvider.LOCAL,
    });

    // 5. Generate JWT tokens
    const tokens = await this.generateTokens(user);

    // 6. Store refresh token hash (for validation later)
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  // ==================== LOGIN ====================
  async login(dto: LoginDto, ip?: string): Promise<AuthResponse> {
    // 1. Validate credentials
    const user = await this.usersService.validateCredentials(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Update last login info
    await this.usersService.updateLastLogin(user.id, ip);

    // 3. Generate tokens (longer refresh if rememberMe)
    const tokens = await this.generateTokens(user, dto.rememberMe);

    // 4. Store refresh token hash
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  // ==================== REFRESH TOKENS ====================
  async refreshTokens(refreshToken: string): Promise<TokensDto> {
    try {
      // 1. Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });

      // 2. Find user
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // 3. Verify token hash matches
      const isValidToken = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!isValidToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // 4. Generate new tokens
      const tokens = await this.generateTokens(user);

      // 5. Update refresh token hash
      const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
      await this.usersService.updateRefreshToken(user.id, newRefreshTokenHash);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ==================== LOGOUT ====================
  async logout(userId: string): Promise<void> {
    // Clear refresh token hash
    await this.usersService.updateRefreshToken(userId, null);
  }

  // ==================== TOKEN GENERATION ====================
  private async generateTokens(user: User, rememberMe = false): Promise<TokensDto> {
    // Access Token Payload
    const accessPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    // Refresh Token Payload
    const refreshPayload = {
      sub: user.id,
      tenantId: user.tenantId,
    };

    // Token expiration times
    const accessExpiresIn = '15m'; // 15 minutes
    const refreshExpiresIn = rememberMe ? '30d' : '7d'; // 30 days or 7 days

    // Sign tokens
    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: 'Bearer',
    };
  }

  // Remove sensitive fields before sending to client
  private sanitizeUser(user: User): Partial<User> {
    const { password, refreshTokenHash, ...sanitized } = user;
    return sanitized;
  }
}
```

#### Auth DTOs

**File:** `apps/api/src/modules/auth/dto/register.dto.ts`

```typescript
export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: 'Acme Inc' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  acceptTerms: boolean;
}
```

**File:** `apps/api/src/modules/auth/dto/login.dto.ts`

```typescript
export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
```

### 2.6 Database Flow - User Registration

```
1. User submits registration form:
   {
     email: "john@example.com",
     password: "SecureP@ss123",
     firstName: "John",
     lastName: "Doe",
     companyName: "Acme Inc",
     acceptTerms: true
   }

2. INSERT INTO tenants:
   ┌──────────────────────────────────────────────────────────┐
   │ id: "550e8400-e29b-41d4-a716-446655440000"               │
   │ name: "Acme Inc"                                         │
   │ slug: "acme-inc"                                         │
   │ plan: "free"                                             │
   │ status: "trial"                                          │
   │ limits: { maxContacts: 500, maxEmailsPerMonth: 1000 }    │
   │ billing_email: "john@example.com"                        │
   │ created_at: "2026-01-07T10:00:00Z"                       │
   └──────────────────────────────────────────────────────────┘

3. INSERT INTO users:
   ┌──────────────────────────────────────────────────────────┐
   │ id: "661e8400-e29b-41d4-a716-446655440001"               │
   │ tenant_id: "550e8400-e29b-41d4-a716-446655440000"        │
   │ email: "john@example.com"                                │
   │ password: "$2b$12$hashedpasswordhere..."                 │
   │ first_name: "John"                                       │
   │ last_name: "Doe"                                         │
   │ role: "owner"                                            │
   │ status: "pending"                                        │
   │ auth_provider: "local"                                   │
   │ email_verified: false                                    │
   │ refresh_token_hash: "$2b$10$hashedtokenhere..."          │
   │ created_at: "2026-01-07T10:00:00Z"                       │
   └──────────────────────────────────────────────────────────┘

4. Response sent to frontend:
   {
     user: {
       id: "661e8400-e29b-41d4-a716-446655440001",
       email: "john@example.com",
       firstName: "John",
       lastName: "Doe",
       role: "owner",
       tenantId: "550e8400-e29b-41d4-a716-446655440000",
       emailVerified: false
     },
     tokens: {
       accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       expiresIn: 900,
       tokenType: "Bearer"
     }
   }
```

---

## 3. Frontend (Next.js)

### 3.1 Directory Structure

```
apps/web/src/
├── app/                          # Next.js 14 App Router
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Global styles
│   ├── (auth)/                   # Auth pages (grouped)
│   │   ├── layout.tsx            # Auth layout with branding
│   │   ├── login/page.tsx        # Login page
│   │   ├── register/page.tsx     # Register page
│   │   ├── forgot-password/      # Forgot password page
│   │   └── reset-password/       # Reset password page
│   ├── (dashboard)/              # Dashboard pages (grouped)
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   ├── dashboard/page.tsx    # Main dashboard
│   │   ├── contacts/             # Contacts pages
│   │   ├── campaigns/            # Campaigns pages
│   │   ├── templates/            # Templates pages
│   │   ├── analytics/            # Analytics pages
│   │   └── settings/             # Settings pages
│   └── (marketing)/              # Public marketing pages
├── components/
│   ├── ui/                       # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── checkbox.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── sidebar.tsx           # Dashboard sidebar
│   │   └── header.tsx            # Dashboard header
│   ├── common/
│   │   ├── page-header.tsx
│   │   ├── stats-card.tsx
│   │   └── loading-spinner.tsx
│   └── forms/                    # Form components
├── lib/
│   ├── api/
│   │   ├── client.ts             # Axios instance
│   │   ├── auth.ts               # Auth API calls
│   │   └── index.ts              # Export all
│   ├── hooks/
│   │   ├── use-auth.ts           # Auth hook
│   │   └── index.ts
│   └── utils/
│       └── cn.ts                 # Class name utility
├── providers/
│   ├── index.tsx                 # All providers combined
│   └── auth-provider.tsx         # Auth initialization
├── store/
│   ├── auth-store.ts             # Zustand auth store
│   ├── ui-store.ts               # UI state store
│   └── index.ts
├── styles/
│   └── themes/                   # Theme configurations
└── types/                        # TypeScript types
```

### 3.2 Providers

**File:** `apps/web/src/providers/index.tsx`

```typescript
'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

**File:** `apps/web/src/providers/auth-provider.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store';
import { authApi } from '@/lib/api/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, logout, accessToken } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const token = accessToken || localStorage.getItem('accessToken');

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        // Validate token by fetching user profile
        const user = await authApi.getProfile();
        setUser(user);
      } catch (error) {
        // Token is invalid, clear auth state
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  return <>{children}</>;
}
```

### 3.3 State Management - Zustand

**File:** `apps/web/src/store/auth-store.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  emailVerified: boolean;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  setLoading: (isLoading: boolean) => void;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      // Initial State
      user: null,
      isAuthenticated: false,
      isLoading: true,
      accessToken: null,
      refreshToken: null,

      // Actions
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      login: (user, accessToken, refreshToken) => {
        // Store tokens in localStorage for API client
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
        }
        set({
          user,
          isAuthenticated: true,
          accessToken,
          refreshToken,
          isLoading: false,
        });
      },

      logout: () => {
        // Clear tokens from localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
          refreshToken: null,
          isLoading: false,
        });
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
```

### 3.4 API Client

**File:** `apps/web/src/lib/api/client.ts`

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - Add auth token to every request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          // Get new tokens
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Extract error message from API response
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'An error occurred';
  }
  return 'An unexpected error occurred';
}
```

**File:** `apps/web/src/lib/api/auth.ts`

```typescript
import { apiClient } from './client';

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  companyName?: string;
  acceptTerms: boolean;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
    emailVerified: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },

  getProfile: async (): Promise<AuthResponse['user']> => {
    const response = await apiClient.get<AuthResponse['user']>('/auth/me');
    return response.data;
  },

  forgotPassword: async (data: { email: string }): Promise<void> => {
    await apiClient.post('/auth/forgot-password', data);
  },

  resetPassword: async (data: { token: string; password: string }): Promise<void> => {
    await apiClient.post('/auth/reset-password', data);
  },
};
```

### 3.5 Auth Hook

**File:** `apps/web/src/lib/hooks/use-auth.ts`

```typescript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authApi, LoginCredentials, RegisterData } from '@/lib/api';
import { useAuthStore } from '@/store';
import { getErrorMessage } from '@/lib/api/client';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, login, logout: logoutStore } = useAuthStore();

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      // Save to Zustand store
      login(data.user, data.tokens.accessToken, data.tokens.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Welcome back!');
      router.push('/dashboard');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authApi.register(data),
    onSuccess: (data) => {
      login(data.user, data.tokens.accessToken, data.tokens.refreshToken);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Account created successfully!');
      router.push('/onboarding');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      logoutStore();
      queryClient.clear();
      router.push('/login');
      toast.success('Logged out successfully');
    },
    onError: () => {
      // Still logout on client even if server fails
      logoutStore();
      queryClient.clear();
      router.push('/login');
    },
  });

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoginPending: loginMutation.isPending,
    isRegisterPending: registerMutation.isPending,
    isLogoutPending: logoutMutation.isPending,
  };
}
```

### 3.6 Route Protection

#### Auth Layout (Redirects logged-in users to dashboard)

**File:** `apps/web/src/app/(auth)/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components/common';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // If user is logged in, redirect to dashboard
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Don't render auth pages if user is authenticated
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary">
        {/* Branding content */}
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
```

#### Dashboard Layout (Redirects guests to login)

**File:** `apps/web/src/app/(dashboard)/layout.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { DashboardSidebar } from '@/components/layout/sidebar';
import { DashboardHeader } from '@/components/layout/header';
import { LoadingSpinner } from '@/components/common';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // If user is not logged in, redirect to login
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Don't render dashboard if user is not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

### 3.7 Login Page

**File:** `apps/web/src/app/(auth)/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/hooks';

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoginPending } = useAuth();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = (data: LoginFormData) => {
    login({
      email: data.email,
      password: data.password,
      rememberMe: data.rememberMe,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">
          Enter your credentials to access your account
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="name@example.com"
            icon={<Mail className="h-4 w-4" />}
            error={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              icon={<Lock className="h-4 w-4" />}
              error={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Controller
              name="rememberMe"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="rememberMe"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <label htmlFor="rememberMe" className="text-sm">
              Remember me
            </label>
          </div>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            Forgot password?
          </Link>
        </div>

        {/* Submit Button */}
        <Button type="submit" className="w-full" loading={isLoginPending}>
          Sign in
        </Button>
      </form>

      {/* Register Link */}
      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link href="/register" className="text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
```

---

## 4. Complete Request Flow

### Login Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER CLICKS LOGIN                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Next.js - Port 3001)                                      │
│                                                                     │
│  1. LoginPage: User fills form and clicks "Sign In"                 │
│  2. useForm validates with Zod schema                               │
│  3. onSubmit calls useAuth().login({ email, password, rememberMe }) │
│  4. loginMutation calls authApi.login(credentials)                  │
│  5. apiClient.post('http://localhost:3000/api/v1/auth/login')       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          HTTP POST Request
                          Headers: Content-Type: application/json
                          Body: { email, password, rememberMe }
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND (NestJS - Port 3000)                                        │
│                                                                     │
│  6. AuthController.login(dto) receives request                      │
│  7. ValidationPipe validates LoginDto                               │
│  8. AuthService.login(dto, ip) is called                            │
│     a. usersService.validateCredentials(email, password)            │
│        - Query: SELECT * FROM users WHERE email = ?                 │
│        - bcrypt.compare(password, user.password)                    │
│     b. usersService.updateLastLogin(userId, ip)                     │
│        - UPDATE users SET last_login_at = NOW()                     │
│     c. generateTokens(user, rememberMe)                             │
│        - Create JWT access token (15m expiry)                       │
│        - Create JWT refresh token (7d or 30d expiry)                │
│     d. updateRefreshToken(userId, hash(refreshToken))               │
│        - UPDATE users SET refresh_token_hash = ?                    │
│  9. Return { user, tokens }                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          HTTP Response 200 OK
                          Body: { user, tokens }
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                            │
│                                                                     │
│  10. loginMutation.onSuccess(data) callback fires                   │
│  11. useAuthStore().login(user, accessToken, refreshToken)          │
│      - localStorage.setItem('accessToken', accessToken)             │
│      - localStorage.setItem('refreshToken', refreshToken)           │
│      - Zustand state: { user, isAuthenticated: true }               │
│  12. queryClient.invalidateQueries(['profile'])                     │
│  13. toast.success('Welcome back!')                                 │
│  14. router.push('/dashboard')                                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DASHBOARD PAGE LOADS                                                │
│                                                                     │
│  15. DashboardLayout mounts                                         │
│  16. useAuthStore() returns { isAuthenticated: true }               │
│  17. Layout renders sidebar + header + main content                 │
│  18. Dashboard page displays user data                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ API Request with Expired Token                                      │
│                                                                     │
│  1. User makes API request                                          │
│  2. apiClient adds Authorization: Bearer <expired_token>            │
│  3. Backend returns 401 Unauthorized                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Axios Response Interceptor                                          │
│                                                                     │
│  4. Interceptor catches 401 error                                   │
│  5. Gets refreshToken from localStorage                             │
│  6. POST /api/v1/auth/refresh { refreshToken }                      │
│  7. Backend validates refresh token                                 │
│  8. Backend returns new { accessToken, refreshToken }               │
│  9. Store new tokens in localStorage                                │
│  10. Retry original request with new accessToken                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. What's Built vs Not Built

### Completed Features

| Feature                 | Backend      | Frontend                  | Database               |
| ----------------------- | ------------ | ------------------------- | ---------------------- |
| User Registration       | ✅ Complete  | ✅ Complete               | ✅ users, tenants      |
| User Login              | ✅ Complete  | ✅ Complete               | ✅ users               |
| JWT Authentication      | ✅ Complete  | ✅ Complete               | -                      |
| Token Refresh           | ✅ Complete  | ✅ Complete               | ✅ refresh_token_hash  |
| Logout                  | ✅ Complete  | ✅ Complete               | -                      |
| Route Protection        | ✅ Guards    | ✅ Layouts                | -                      |
| Multi-tenancy           | ✅ Complete  | ✅ Stored                 | ✅ tenant_id FK        |
| Google OAuth            | ✅ Strategy  | ⚠️ Button only            | ✅ google_id           |
| Password Change         | ✅ Complete  | ❌ No UI                  | -                      |
| Forgot Password         | ⚠️ Partial   | ✅ Page exists            | -                      |
| Dashboard Layout        | -            | ✅ Complete               | -                      |
| Dashboard Page          | -            | ✅ Mock data              | -                      |
| **Contacts CRUD**       | ✅ Complete  | ✅ Complete               | ✅ contacts            |
| **Contact Import**      | ✅ CSV/Excel | ✅ Import UI              | ✅ import_jobs         |
| **Contact Lists**       | ✅ Complete  | ✅ Complete               | ✅ contact_lists       |
| **Email Templates**     | ✅ Complete  | ✅ Unlayer Editor         | ✅ templates           |
| **SMS Templates**       | ✅ Complete  | ✅ Editor + Preview       | ✅ templates           |
| **WhatsApp Templates**  | ✅ Complete  | ✅ Editor + iPhone Mockup | ✅ templates           |
| **Pre-built Templates** | ✅ Seeded    | ✅ Gallery View           | ✅ template_categories |

### Not Implemented (Empty Modules)

| Feature              | Backend Status | Frontend Status      |
| -------------------- | -------------- | -------------------- |
| Campaigns CRUD       | Empty module   | Pages exist (no API) |
| Analytics            | Empty module   | Pages exist (no API) |
| Billing/Stripe       | Empty module   | No pages             |
| Email Sending (SES)  | Module exists  | Not integrated       |
| SMS Sending (Twilio) | Module exists  | Not integrated       |
| WhatsApp Sending     | Module exists  | Not integrated       |
| File Upload (S3)     | Module exists  | Not integrated       |
| API Keys             | Empty module   | No pages             |
| Webhooks             | Empty module   | No pages             |

---

## 6. Key Files Summary

### Backend Files

| Purpose            | File Path                                                |
| ------------------ | -------------------------------------------------------- |
| Entry point        | `apps/api/src/main.ts`                                   |
| Root module        | `apps/api/src/app.module.ts`                             |
| Database config    | `apps/api/src/config/database.config.ts`                 |
| Environment config | `apps/api/src/config/configuration.ts`                   |
| Base entities      | `apps/api/src/common/entities/base.entity.ts`            |
| Auth controller    | `apps/api/src/modules/auth/auth.controller.ts`           |
| Auth service       | `apps/api/src/modules/auth/auth.service.ts`              |
| Auth DTOs          | `apps/api/src/modules/auth/dto/*.ts`                     |
| JWT strategy       | `apps/api/src/modules/auth/strategies/jwt.strategy.ts`   |
| User entity        | `apps/api/src/modules/users/entities/user.entity.ts`     |
| User service       | `apps/api/src/modules/users/users.service.ts`            |
| Tenant entity      | `apps/api/src/modules/tenants/entities/tenant.entity.ts` |
| JWT auth guard     | `apps/api/src/common/guards/jwt-auth.guard.ts`           |
| Decorators         | `apps/api/src/common/decorators/*.ts`                    |

### Frontend Files

| Purpose          | File Path                                         |
| ---------------- | ------------------------------------------------- |
| Root layout      | `apps/web/src/app/layout.tsx`                     |
| Providers        | `apps/web/src/providers/index.tsx`                |
| Auth provider    | `apps/web/src/providers/auth-provider.tsx`        |
| Auth store       | `apps/web/src/store/auth-store.ts`                |
| API client       | `apps/web/src/lib/api/client.ts`                  |
| Auth API         | `apps/web/src/lib/api/auth.ts`                    |
| Auth hook        | `apps/web/src/lib/hooks/use-auth.ts`              |
| Auth layout      | `apps/web/src/app/(auth)/layout.tsx`              |
| Login page       | `apps/web/src/app/(auth)/login/page.tsx`          |
| Register page    | `apps/web/src/app/(auth)/register/page.tsx`       |
| Dashboard layout | `apps/web/src/app/(dashboard)/layout.tsx`         |
| Dashboard page   | `apps/web/src/app/(dashboard)/dashboard/page.tsx` |
| Sidebar          | `apps/web/src/components/layout/sidebar.tsx`      |
| Header           | `apps/web/src/components/layout/header.tsx`       |

### Environment Files

| File                  | Purpose                        |
| --------------------- | ------------------------------ |
| `.env`                | Root environment variables     |
| `apps/api/.env`       | Backend environment variables  |
| `apps/web/.env.local` | Frontend environment variables |
| `docker-compose.yml`  | Docker services configuration  |

### Environment Variables (apps/api/.env)

```env
# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3001

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5433
DATABASE_NAME=marketing
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# JWT
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

## Next Steps

To continue building this platform, the next features to implement would be:

1. **Campaigns Module** - Create and manage multi-channel campaigns (Email, SMS, WhatsApp)
2. **Email Integration** - Connect AWS SES for sending emails
3. **SMS Integration** - Connect Twilio for SMS sending
4. **WhatsApp Integration** - Connect Twilio for WhatsApp messaging
5. **Analytics** - Track campaign performance and engagement metrics
6. **Billing** - Stripe subscription management
