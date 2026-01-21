import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

import { AuthService, AuthResponse } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto, TokensDto } from './dto/tokens.dto';
import { ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto } from './dto/forgot-password.dto';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantsService } from '../tenants/tenants.service';

interface GoogleUser {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 registrations per hour per IP
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user and create workspace' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 900000 } }) // 10 login attempts per 15 minutes per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthResponse> {
    const ip = req.ip || req.socket.remoteAddress;
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 3600000 } }) // 30 refresh attempts per hour per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async refreshTokens(@Body() dto: RefreshTokenDto): Promise<TokensDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@CurrentUser('id') userId: string): Promise<{ message: string }> {
    await this.authService.logout(userId);
    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 password reset requests per hour per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent if account exists' })
  @ApiResponse({ status: 429, description: 'Too many password reset requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 reset attempts per hour per IP
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiResponse({ status: 429, description: 'Too many reset attempts' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto
  ): Promise<{ message: string }> {
    await this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Fetch tenant to get region
    const tenantId = user.tenantId as string;
    const tenant = tenantId ? await this.tenantsService.findById(tenantId) : null;

    return {
      ...user,
      tenantRegion: tenant?.region || 'US',
    };
  }

  // =============================================
  // Google OAuth
  // =============================================

  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  async googleAuth(): Promise<void> {
    // Passport handles the redirect
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens in secure cookies' })
  async googleAuthCallback(
    @Req() req: Request & { user: GoogleUser },
    @Res() res: Response
  ): Promise<void> {
    const result = await this.authService.validateGoogleUser(req.user);
    const frontendUrl = this.configService.get<string>('frontendUrl');
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    // Set tokens as httpOnly cookies instead of URL params for security
    // This prevents token exposure in browser history, logs, and referrer headers
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // Only HTTPS in production
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes for access token cookie
    };

    // Set access token cookie
    res.cookie('auth_access_token', result.tokens.accessToken, cookieOptions);

    // Set refresh token cookie with longer expiry
    res.cookie('auth_refresh_token', result.tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Also pass a success indicator (not the token) in URL for frontend to know auth succeeded
    // Frontend should read tokens from cookies via a secure endpoint
    const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
    redirectUrl.searchParams.set('success', 'true');
    redirectUrl.searchParams.set('provider', 'google');

    res.redirect(redirectUrl.toString());
  }

  @Get('tokens-from-cookies')
  @Public()
  @ApiOperation({
    summary: 'Exchange OAuth cookies for tokens (one-time use after OAuth callback)',
  })
  @ApiResponse({ status: 200, description: 'Tokens retrieved and cookies cleared' })
  @ApiResponse({ status: 401, description: 'No OAuth tokens found' })
  async getTokensFromCookies(@Req() req: Request, @Res() res: Response): Promise<void> {
    const accessToken = req.cookies?.auth_access_token;
    const refreshToken = req.cookies?.auth_refresh_token;

    if (!accessToken || !refreshToken) {
      res.status(401).json({ error: 'No OAuth tokens found in cookies' });
      return;
    }

    // Clear the cookies after reading (one-time use)
    res.clearCookie('auth_access_token', { path: '/' });
    res.clearCookie('auth_refresh_token', { path: '/' });

    // Return tokens in response body
    res.json({
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
      tokenType: 'Bearer',
    });
  }
}
