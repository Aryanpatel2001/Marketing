import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables before anything else
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    rawBody: true, // Enable raw body for webhook signature verification
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // Security
  app.use(helmet());

  // Cookie parser for OAuth cookie handling
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:3001'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/(.*)', 'docs', 'uploads/(.*)'],
  });

  // Serve static files from uploads directory with CORS headers
  app.use(
    '/uploads',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.join(process.cwd(), 'uploads'))
  );

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Swagger Documentation (only in development)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Marketing Platform API')
      .setDescription(
        `
## Overview
Multi-channel marketing automation platform API for Email, SMS, and WhatsApp campaigns.

## Authentication
Most endpoints require authentication via JWT Bearer token or API Key.

### JWT Authentication
Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

### API Key Authentication
Include the API key in the X-API-Key header:
\`\`\`
X-API-Key: <your_api_key>
\`\`\`

## Rate Limiting
API requests are rate-limited based on your plan:
- Free: 100 requests/hour
- Starter: 1,000 requests/hour
- Growth: 5,000 requests/hour
- Pro: 10,000 requests/hour
      `
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth'
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API Key for external integrations',
        },
        'API-key'
      )
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Users', 'User management endpoints')
      .addTag('Contacts', 'Contact management endpoints')
      .addTag('Campaigns', 'Campaign management endpoints')
      .addTag('Templates', 'Email template endpoints')
      .addTag('Analytics', 'Analytics and reporting endpoints')
      .addTag('Webhooks', 'Webhook configuration endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      customSiteTitle: 'Marketing Platform API Docs',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   Marketing Platform API                                  ║
  ║                                                           ║
  ║   Server running on: http://localhost:${port}               ║
  ║   API Docs:          http://localhost:${port}/docs          ║
  ║   Environment:       ${configService.get('NODE_ENV', 'development').padEnd(32)}║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
