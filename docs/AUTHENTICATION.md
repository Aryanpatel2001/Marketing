# Authentication System Documentation

## Overview

This document covers the complete authentication system for the Marketing Automation Platform. The system is built with NestJS (backend) and Next.js (frontend), featuring JWT-based authentication, OAuth integration, and multi-tenant support.

---

## Table of Contents

1. [Architecture](#architecture)
2. [User Registration](#user-registration)
3. [Login Flow](#login-flow)
4. [JWT Token Management](#jwt-token-management)
5. [Token Refresh](#token-refresh)
6. [Password Management](#password-management)
7. [Google OAuth](#google-oauth)
8. [Guards & Security](#guards--security)
9. [Frontend Implementation](#frontend-implementation)
10. [API Reference](#api-reference)
11. [Configuration](#configuration)
12. [Database Schema](#database-schema)

---

## Architecture

### Backend Stack

- **Framework**: NestJS
- **Authentication**: Passport.js with JWT and Google OAuth strategies
- **Password Hashing**: bcrypt (salt rounds: 12)
- **Token Storage**: PostgreSQL (hashed refresh tokens)

### Frontend Stack

- **Framework**: Next.js 14 (App Router)
- **State Management**: Zustand with persist middleware
- **API Client**: Axios with interceptors
- **Data Fetching**: TanStack Query (React Query)

### File Structure

```
Backend (apps/api/src/modules/auth/)
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── dto/
│   ├── login.dto.ts
│   ├── register.dto.ts
│   └── tokens.dto.ts
└── strategies/
    ├── jwt.strategy.ts
    ├── jwt-refresh.strategy.ts
    └── google.strategy.ts

Frontend (apps/web/src/)
├── app/(auth)/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── lib/
│   ├── api/auth.ts
│   └── hooks/use-auth.ts
└── store/auth-store.ts
```

---

## User Registration

### Flow

```
1. User submits registration form
2. Backend validates input (email, password strength)
3. Create tenant (workspace) for user
4. Create Stripe customer (if configured)
5. Create user as OWNER of tenant
6. Initialize wallet for tenant
7. Generate JWT tokens
8. Return user profile + tokens
9. Redirect to onboarding (/onboarding/select-plan)
```

### Registration DTO

```typescript
interface RegisterDto {
  email: string; // Required, valid email
  password: string; // Min 8 chars, 1 upper, 1 lower, 1 number
  firstName: string; // Required
  lastName: string; // Required
  companyName?: string; // Optional (defaults to "{firstName}'s Workspace")
  phone?: string; // Optional
  acceptTerms: boolean; // Required (must be true)
}
```

### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number

### What Gets Created

1. **Tenant**: New workspace with 14-day trial status
2. **User**: With OWNER role, LOCAL auth provider
3. **Stripe Customer**: Linked to tenant (if Stripe configured)
4. **Wallet**: Initialized with $0 balance

---

## Login Flow

### Standard Login

```
1. User submits email/password
2. Validate credentials against database
3. Update last login timestamp and IP
4. Generate access + refresh tokens
5. Store refresh token hash in database
6. Return user profile + tokens
7. Redirect to dashboard
```

### Login DTO

```typescript
interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean; // Extends refresh token to 30 days
}
```

### Response

```typescript
interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    tenantId: string;
    role: UserRole;
    // ... other fields
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // Seconds until access token expires
    tokenType: 'Bearer';
  };
}
```

---

## JWT Token Management

### Token Types

#### Access Token

- **Purpose**: API authentication
- **Lifetime**: 15 minutes (configurable)
- **Storage**: localStorage (frontend)
- **Payload**:

```typescript
interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  tenantId: string;
  role: UserRole;
  iat: number; // Issued at
  exp: number; // Expiration
}
```

#### Refresh Token

- **Purpose**: Obtain new access tokens
- **Lifetime**: 7 days (30 days with "Remember Me")
- **Storage**: localStorage (frontend), hashed in DB (backend)
- **Payload**:

```typescript
interface RefreshTokenPayload {
  sub: string; // User ID
  tenantId: string;
  iat: number;
  exp: number;
}
```

### Token Signing

```typescript
// Access token uses: jwt.accessSecret
// Refresh token uses: jwt.refreshSecret (different secret)
```

---

## Token Refresh

### Flow

```
1. Access token expires (401 response)
2. Frontend interceptor catches 401
3. Call POST /auth/refresh with refresh token
4. Backend validates:
   - Token signature
   - Token not expired
   - Hash matches stored hash
5. Generate new token pair
6. Update stored refresh token hash
7. Retry original request with new access token
```

### Automatic Retry (Frontend)

```typescript
// Axios interceptor handles this automatically
// Original request is queued and retried after refresh
// If refresh fails, user is logged out
```

---

## Password Management

### Forgot Password

```
POST /auth/forgot-password
Body: { email: string }

- Always returns success (prevents email enumeration)
- TODO: Send reset email with token
- Token valid for 1 hour
```

### Reset Password

```
POST /auth/reset-password
Body: { token: string, newPassword: string }

- Validates token from email link
- Updates password
- Clears all refresh tokens (security measure)
- Redirects to login
```

### Change Password (Authenticated)

```
POST /auth/change-password
Headers: Authorization: Bearer {token}
Body: { currentPassword: string, newPassword: string }

- Validates current password
- Updates to new password
- Clears all refresh tokens
- Marks passwordChangedAt timestamp
- Old tokens become invalid
```

---

## Google OAuth

### Flow

```
1. User clicks "Continue with Google"
2. Redirect to Google consent screen
3. Google redirects to callback with code
4. Exchange code for user info
5. Check if user exists:
   - Existing Google user → Login
   - Existing email (LOCAL) → Error (prevent account takeover)
   - New user → Create tenant + user
6. Generate tokens
7. Redirect to frontend with tokens in query params
```

### Configuration

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

### Endpoints

```
GET /auth/google              # Initiates OAuth flow
GET /auth/google/callback     # OAuth callback handler
```

### User Creation (New OAuth User)

- AuthProvider: GOOGLE
- Email marked as verified
- Random password (not used)
- Tenant + Stripe customer + Wallet created

---

## Guards & Security

### JwtAuthGuard

- Default guard on all routes
- Validates access token
- Respects `@Public()` decorator
- Checks password change timestamp

### Usage

```typescript
// Protected by default
@Controller('campaigns')
export class CampaignsController { }

// Public route
@Public()
@Get('health')
healthCheck() { }
```

### Token Validation

1. Verify JWT signature
2. Check expiration
3. Verify user exists in database
4. Check if password changed after token issued

### Multi-Tenancy

- Tenant ID from JWT payload
- All database queries scoped by tenantId
- Users cannot access other tenants' data

### Role-Based Access

```typescript
enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer'
}

@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(RolesGuard)
deleteUser() { }
```

---

## Frontend Implementation

### Auth Store (Zustand)

```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

interface AuthActions {
  login: (user, accessToken, refreshToken) => void;
  logout: () => void;
  updateUser: (user) => void;
  setTokens: (accessToken, refreshToken) => void;
  setLoading: (loading) => void;
}
```

### useAuth Hook

```typescript
const {
  user,
  isAuthenticated,
  isLoading,
  login,
  register,
  logout,
  forgotPassword,
  resetPassword,
  updateProfile,
  isLoginPending,
  isRegisterPending,
  // ... other pending states
} = useAuth();
```

### API Client Interceptor

```typescript
// Request: Adds Bearer token
// Response: Handles 401, auto-refresh, retry
```

### Protected Route Layout

```typescript
// (auth)/layout.tsx
// - Redirects authenticated users to dashboard
// - Shows loading spinner during auth check
```

### Dashboard Layout

```typescript
// (dashboard)/layout.tsx
// - Redirects unauthenticated users to login
// - Shows loading spinner during auth check
```

---

## API Reference

### Endpoints

| Method | Endpoint              | Auth | Description               |
| ------ | --------------------- | ---- | ------------------------- |
| POST   | /auth/register        | No   | Create new account        |
| POST   | /auth/login           | No   | Login with credentials    |
| POST   | /auth/logout          | Yes  | Logout current session    |
| POST   | /auth/refresh         | No   | Refresh access token      |
| GET    | /auth/me              | Yes  | Get current user profile  |
| POST   | /auth/forgot-password | No   | Request password reset    |
| POST   | /auth/reset-password  | No   | Reset password with token |
| POST   | /auth/change-password | Yes  | Change password           |
| GET    | /auth/google          | No   | Initiate Google OAuth     |
| GET    | /auth/google/callback | No   | Google OAuth callback     |

### Error Responses

```typescript
// 400 Bad Request - Validation errors
{ statusCode: 400, message: ['error details'], error: 'Bad Request' }

// 401 Unauthorized - Invalid credentials or token
{ statusCode: 401, message: 'Invalid email or password', error: 'Unauthorized' }

// 409 Conflict - Duplicate email
{ statusCode: 409, message: 'A user with this email already exists', error: 'Conflict' }
```

---

## Configuration

### Environment Variables

```env
# JWT Configuration
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Frontend URL (for redirects)
FRONTEND_URL=http://localhost:3001
```

### Config Module (apps/api/src/config/configuration.ts)

```typescript
jwt: {
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
},
google: {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackUrl: process.env.GOOGLE_CALLBACK_URL,
},
```

---

## Database Schema

### User Entity

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Column({ enum: AuthProvider, default: AuthProvider.LOCAL })
  authProvider: AuthProvider;

  @Column({ nullable: true })
  googleId: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  emailVerifiedAt: Date;

  @Column({ select: false, nullable: true })
  refreshTokenHash: string;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastLoginIp: string;

  @Column({ nullable: true })
  passwordChangedAt: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @Column({ type: 'jsonb', nullable: true })
  preferences: UserPreferences;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Auth Provider Enum

```typescript
enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
}
```

---

## Security Best Practices Implemented

1. **Password Security**
   - Bcrypt hashing with salt
   - Strong password requirements
   - Password change invalidates tokens

2. **Token Security**
   - Short-lived access tokens
   - Refresh tokens stored as hashes
   - Separate secrets for each token type

3. **OAuth Security**
   - Prevents email account takeover
   - State validation (CSRF protection)
   - Secure callback handling

4. **Multi-Tenancy**
   - Tenant isolation at database level
   - Tenant ID in JWT payload
   - Scoped queries

5. **Error Handling**
   - Generic error messages (no enumeration)
   - Detailed logging (backend only)
   - User-friendly toast notifications

---

## Future Enhancements

- [ ] Email verification workflow
- [ ] Two-factor authentication (2FA)
- [ ] Session device management
- [ ] Account lockout after failed attempts
- [ ] Magic link authentication
- [ ] SAML/SSO integration
