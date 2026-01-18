import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { TenantsService } from '../tenants/tenants.service';
import { AuthProvider, User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { StripeService } from '../billing/services/stripe.service';
import { WalletService } from '../billing/services/wallet.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload, RefreshTokenPayload, TokensDto } from './dto/tokens.dto';

export interface AuthResponse {
  user: Partial<User>;
  tokens: TokensDto;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly walletService: WalletService
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    if (!dto.acceptTerms) {
      throw new BadRequestException('You must accept the terms and conditions');
    }

    // Check if user already exists (by email, any tenant)
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Validate phone number region (will throw if not US or EU)
    this.tenantsService.detectRegionFromPhone(dto.phoneNumber);

    // Create tenant first with phone number for region detection
    const tenant = await this.tenantsService.create({
      name: dto.companyName || `${dto.firstName}'s Workspace`,
      billingEmail: dto.email,
      phoneNumber: dto.phoneNumber,
    });

    // Create Stripe customer if Stripe is configured
    let stripeCustomerId: string | null = null;
    if (this.stripeService.isConfigured()) {
      try {
        const stripeCustomer = await this.stripeService.createCustomer({
          email: dto.email,
          name: dto.companyName || `${dto.firstName} ${dto.lastName}`,
          tenantId: tenant.id,
        });
        stripeCustomerId = stripeCustomer.id;

        // Update tenant with Stripe customer ID
        await this.tenantsService.update(tenant.id, { stripeCustomerId });

        this.logger.log(`Created Stripe customer ${stripeCustomerId} for tenant ${tenant.id}`);
      } catch (error) {
        this.logger.error(`Failed to create Stripe customer: ${error.message}`);
        // Continue without Stripe - billing features will be limited
      }
    }

    // Create user as owner of the tenant
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      tenantId: tenant.id,
      role: UserRole.OWNER,
      phone: dto.phoneNumber,
      authProvider: AuthProvider.LOCAL,
    });

    // Initialize wallet for the tenant
    try {
      await this.walletService.findOrCreateWallet(tenant.id);
      this.logger.log(`Created wallet for tenant ${tenant.id}`);
    } catch (error) {
      this.logger.error(`Failed to create wallet: ${error.message}`);
    }

    // Note: Subscription is NOT created here - user will select plan in onboarding
    // The checkout.session.completed webhook will create the subscription
    this.logger.log(`Tenant ${tenant.id} created - awaiting plan selection in onboarding`);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Store refresh token hash
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      user: this.sanitizeUser(user, tenant.region),
      tokens,
    };
  }

  async login(dto: LoginDto, ip?: string): Promise<AuthResponse> {
    const user = await this.usersService.validateCredentials(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Fetch tenant to get region
    const tenant = await this.tenantsService.findById(user.tenantId);

    // Update last login info
    await this.usersService.updateLastLogin(user.id, ip);

    // Generate tokens
    const tokens = await this.generateTokens(user, dto.rememberMe);

    // Store refresh token hash
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    return {
      user: this.sanitizeUser(user, tenant?.region),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokensDto> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify token hash
      const isValidToken = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!isValidToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update refresh token hash
      const newRefreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
      await this.usersService.updateRefreshToken(user.id, newRefreshTokenHash);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null);
  }

  async validateUser(payload: AccessTokenPayload): Promise<User | null> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      return null;
    }

    // Check if password was changed after token was issued
    if (user.passwordChangedAt && payload.iat) {
      const passwordChangedTimestamp = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (passwordChangedTimestamp > payload.iat) {
        return null;
      }
    }

    return user;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    // Always return success message to prevent email enumeration
    if (!user) {
      return { message: 'If an account with that email exists, we sent a password reset link' };
    }

    // Generate password reset token (valid for 1 hour)
    const resetToken = uuidv4();
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    // TODO: Store reset token in Redis with expiry
    // TODO: Send password reset email

    return { message: 'If an account with that email exists, we sent a password reset link' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // TODO: Validate token from Redis
    // TODO: Find user by token
    // TODO: Update password
    // TODO: Delete token from Redis

    throw new BadRequestException('Password reset functionality not fully implemented');
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const isPasswordValid = await user.validatePassword(currentPassword);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.usersService.updatePassword(userId, newPassword);

    // Invalidate all refresh tokens by clearing stored hash
    await this.usersService.updateRefreshToken(userId, null);
  }

  async validateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  }): Promise<AuthResponse> {
    // Check if user exists with this Google ID
    let user = await this.usersService.findByGoogleId(googleUser.googleId);

    if (!user) {
      // Check if user exists with this email
      const existingUser = await this.usersService.findByEmail(googleUser.email);

      if (existingUser) {
        // Link Google account to existing user
        if (existingUser.authProvider === AuthProvider.LOCAL) {
          throw new BadRequestException(
            'An account with this email already exists. Please sign in with your password and link your Google account in settings.'
          );
        }
        user = existingUser;
      } else {
        // Create new tenant and user
        const tenant = await this.tenantsService.create({
          name: `${googleUser.firstName}'s Workspace`,
          billingEmail: googleUser.email,
        });

        // Create Stripe customer if Stripe is configured
        let stripeCustomerId: string | null = null;
        if (this.stripeService.isConfigured()) {
          try {
            const stripeCustomer = await this.stripeService.createCustomer({
              email: googleUser.email,
              name: `${googleUser.firstName} ${googleUser.lastName}`,
              tenantId: tenant.id,
            });
            stripeCustomerId = stripeCustomer.id;
            await this.tenantsService.update(tenant.id, { stripeCustomerId });
            this.logger.log(`Created Stripe customer ${stripeCustomerId} for tenant ${tenant.id}`);
          } catch (error) {
            this.logger.error(`Failed to create Stripe customer: ${error.message}`);
          }
        }

        user = await this.usersService.create({
          email: googleUser.email,
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          tenantId: tenant.id,
          role: UserRole.OWNER,
          authProvider: AuthProvider.GOOGLE,
          googleId: googleUser.googleId,
          emailVerified: true,
        });

        if (googleUser.avatar) {
          await this.usersService.update(user.id, { avatar: googleUser.avatar });
        }

        // Initialize wallet for the tenant
        try {
          await this.walletService.findOrCreateWallet(tenant.id);
        } catch (error) {
          this.logger.error(`Failed to create wallet: ${error.message}`);
        }

        // Note: Subscription is NOT created here - user will select plan in onboarding
        this.logger.log(`Tenant ${tenant.id} created via Google OAuth - awaiting plan selection`);
      }
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Store refresh token hash
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, refreshTokenHash);

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    // Fetch tenant to get region
    const userTenant = await this.tenantsService.findById(user.tenantId);

    return {
      user: this.sanitizeUser(user, userTenant?.region),
      tokens,
    };
  }

  private async generateTokens(user: User, rememberMe = false): Promise<TokensDto> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
    };

    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn') || '15m';
    const refreshExpiresIn = rememberMe
      ? '30d'
      : this.configService.get<string>('jwt.refreshExpiresIn') || '7d';

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn,
    });

    // Parse expiry to seconds
    const expiresInSeconds = this.parseExpiryToSeconds(accessExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: expiresInSeconds,
      tokenType: 'Bearer',
    };
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  private sanitizeUser(
    user: User,
    tenantRegion?: 'US' | 'EU'
  ): Partial<User> & { tenantRegion?: 'US' | 'EU' } {
    const { password, refreshTokenHash, ...sanitized } = user;
    return {
      ...sanitized,
      ...(tenantRegion && { tenantRegion }),
    };
  }
}
