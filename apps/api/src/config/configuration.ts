export default () => ({
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  // Database
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5433', 10),
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    name: process.env.DATABASE_NAME || 'marketing',
    ssl: process.env.DATABASE_SSL === 'true',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    username: process.env.RABBITMQ_USERNAME || 'guest',
    password: process.env.RABBITMQ_PASSWORD || 'guest',
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      bucket: process.env.AWS_S3_BUCKET || 'marketing-platform-uploads',
    },
    ses: {
      fromEmail: process.env.SES_FROM_EMAIL || 'noreply@yourdomain.com',
      fromName: process.env.SES_FROM_NAME || 'Marketing Platform',
      configurationSet: process.env.SES_CONFIGURATION_SET,
    },
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  },

  // SendGrid (Backup)
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/v1/auth/google/callback',
  },

  // Rate Limiting
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    prices: {
      starter: process.env.STRIPE_PRICE_ID_STARTER,
      growth: process.env.STRIPE_PRICE_ID_GROWTH,
      pro: process.env.STRIPE_PRICE_ID_PRO,
    },
  },

  // Billing
  billing: {
    trialDays: parseInt(process.env.TRIAL_DAYS || '14', 10),
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
    sms: {
      defaultPrice: parseFloat(process.env.SMS_DEFAULT_PRICE || '0.015'),
      prices: {
        US: 0.0079,
        CA: 0.0079,
        GB: 0.04,
        IN: 0.0065,
        AU: 0.08,
        DE: 0.09,
        FR: 0.08,
      },
    },
    email: {
      defaultPrice: parseFloat(process.env.EMAIL_DEFAULT_PRICE || '0.001'),
    },
    whatsapp: {
      defaultPrice: parseFloat(process.env.WHATSAPP_DEFAULT_PRICE || '0.02'),
      conversationFee: parseFloat(process.env.WHATSAPP_CONVERSATION_FEE || '0.005'),
    },
  },
});
