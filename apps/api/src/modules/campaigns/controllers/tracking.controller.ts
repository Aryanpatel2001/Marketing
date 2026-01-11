import { Controller, Get, Param, Query, Res, Req, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Public } from '@/common/decorators';
import { EmailTrackingService } from '../services/email-tracking.service';

// Allowed URL schemes for redirects (prevent javascript:, data:, etc.)
const ALLOWED_SCHEMES = ['http:', 'https:'];

// Block localhost and private IP redirects in production
const BLOCKED_HOSTS_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
];

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);
  private readonly isProduction: boolean;
  private readonly allowedDomains: string[];

  constructor(
    private readonly trackingService: EmailTrackingService,
    private readonly configService: ConfigService
  ) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    // Optional: Configure allowed redirect domains (empty = all external domains allowed)
    const domains = this.configService.get<string>('ALLOWED_REDIRECT_DOMAINS');
    this.allowedDomains = domains ? domains.split(',').map((d) => d.trim().toLowerCase()) : [];
  }

  /**
   * Validate URL to prevent open redirect attacks
   */
  private isValidRedirectUrl(url: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new URL(url);

      // Check scheme
      if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
        return { valid: false, reason: `Invalid scheme: ${parsed.protocol}` };
      }

      // In production, block internal/private IPs
      if (this.isProduction) {
        const hostname = parsed.hostname;
        for (const pattern of BLOCKED_HOSTS_PATTERNS) {
          if (pattern.test(hostname)) {
            return { valid: false, reason: `Blocked host: ${hostname}` };
          }
        }
      }

      // If allowed domains configured, enforce them
      if (this.allowedDomains.length > 0) {
        const hostname = parsed.hostname.toLowerCase();
        const isAllowed = this.allowedDomains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        );
        if (!isAllowed) {
          return { valid: false, reason: `Domain not in allowlist: ${hostname}` };
        }
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: 'Invalid URL format' };
    }
  }

  /**
   * Track email opens via tracking pixel
   * Rate limited to prevent abuse (100 requests per minute per IP)
   */
  @Get('open/:token.png')
  @Public()
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @ApiOperation({ summary: 'Track email open (returns 1x1 pixel)' })
  @ApiParam({ name: 'token', description: 'Encrypted tracking token' })
  async trackOpen(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Record the open event (non-blocking)
    this.trackingService
      .recordOpen(token, {
        ip: this.getClientIp(req),
        userAgent: req.headers['user-agent'],
      })
      .catch((err) => {
        // Silently fail - don't block the pixel response
        this.logger.error('Failed to record open:', err);
      });

    // Return 1x1 transparent pixel
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': TRACKING_PIXEL.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.status(HttpStatus.OK).send(TRACKING_PIXEL);
  }

  /**
   * Track link clicks and redirect
   * Rate limited to prevent abuse (50 requests per minute per IP)
   */
  @Get('click/:token')
  @Public()
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 requests per minute
  @ApiOperation({ summary: 'Track link click and redirect to destination' })
  @ApiParam({ name: 'token', description: 'Encrypted tracking token' })
  @ApiQuery({ name: 'url', description: 'Destination URL (encoded)' })
  async trackClick(
    @Param('token') token: string,
    @Query('url') url: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Decode the URL
    const destinationUrl = decodeURIComponent(url || '');

    if (!destinationUrl) {
      res.status(HttpStatus.BAD_REQUEST).send('Missing destination URL');
      return;
    }

    // SECURITY: Validate URL to prevent open redirect attacks
    const validation = this.isValidRedirectUrl(destinationUrl);
    if (!validation.valid) {
      this.logger.warn(`Blocked redirect to invalid URL: ${destinationUrl} - ${validation.reason}`);
      res.status(HttpStatus.BAD_REQUEST).send('Invalid redirect URL');
      return;
    }

    // Record the click event (non-blocking)
    this.trackingService
      .recordClick(token, destinationUrl, {
        ip: this.getClientIp(req),
        userAgent: req.headers['user-agent'],
      })
      .catch((err) => {
        this.logger.error('Failed to record click:', err);
      });

    // Redirect to the validated URL
    res.redirect(HttpStatus.FOUND, destinationUrl);
  }

  /**
   * Handle unsubscribe requests
   * Rate limited to prevent abuse (10 requests per minute per IP)
   */
  @Get('unsubscribe/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiOperation({ summary: 'Process unsubscribe request' })
  @ApiParam({ name: 'token', description: 'Encrypted tracking token' })
  async unsubscribe(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const result = await this.trackingService.processUnsubscribe(token, {
      ip: this.getClientIp(req),
      userAgent: req.headers['user-agent'],
    });

    if (result.success) {
      // Return a simple HTML confirmation page
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribed</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 48px;
              text-align: center;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 400px;
            }
            .icon {
              width: 64px;
              height: 64px;
              background: #10b981;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 24px;
            }
            .icon svg {
              width: 32px;
              height: 32px;
              color: white;
            }
            h1 {
              color: #1f2937;
              margin: 0 0 16px;
              font-size: 24px;
            }
            p {
              color: #6b7280;
              margin: 0;
              line-height: 1.6;
            }
            .email {
              color: #374151;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1>You've been unsubscribed</h1>
            <p>
              ${result.email ? `<span class="email">${result.email}</span> has been` : 'You have been'}
              successfully removed from our mailing list.
              <br><br>
              You will no longer receive marketing emails from us.
            </p>
          </div>
        </body>
        </html>
      `;
      res.set('Content-Type', 'text/html');
      res.status(HttpStatus.OK).send(html);
    } else {
      // Invalid token
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: #f3f4f6;
            }
            .card {
              background: white;
              border-radius: 16px;
              padding: 48px;
              text-align: center;
              box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            h1 { color: #ef4444; margin: 0 0 16px; }
            p { color: #6b7280; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Invalid Link</h1>
            <p>This unsubscribe link is invalid or has expired.</p>
          </div>
        </body>
        </html>
      `;
      res.set('Content-Type', 'text/html');
      res.status(HttpStatus.BAD_REQUEST).send(html);
    }
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      return ips.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress;
  }
}
