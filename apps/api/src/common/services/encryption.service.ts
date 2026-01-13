import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer | null = null;
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');

    if (!encryptionKey) {
      this.logger.warn(
        'ENCRYPTION_KEY not configured. BYOC credentials encryption will not be available. ' +
          'Generate a key with: openssl rand -hex 32'
      );
      return;
    }

    // Validate key length (must be 32 bytes = 64 hex characters for AES-256)
    if (encryptionKey.length !== 64) {
      this.logger.error(
        `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${encryptionKey.length} characters.`
      );
      return;
    }

    try {
      this.key = Buffer.from(encryptionKey, 'hex');
      this.isConfigured = true;
      this.logger.log('Encryption service initialized successfully');
    } catch (error: any) {
      this.logger.error(`Failed to initialize encryption key: ${error.message}`);
    }
  }

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return this.isConfigured && this.key !== null;
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM
   * Returns encrypted data with IV and authentication tag
   */
  encrypt(plaintext: string): EncryptedData {
    if (!this.isAvailable()) {
      throw new Error(
        'Encryption service not configured. Set ENCRYPTION_KEY environment variable.'
      );
    }

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, this.key!, iv);

    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get the authentication tag
    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Decrypt an encrypted string using AES-256-GCM
   * Requires the IV and authentication tag from encryption
   */
  decrypt(encryptedData: EncryptedData): string {
    if (!this.isAvailable()) {
      throw new Error(
        'Encryption service not configured. Set ENCRYPTION_KEY environment variable.'
      );
    }

    const { encrypted, iv, tag } = encryptedData;

    // Convert hex strings back to buffers
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(this.algorithm, this.key!, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt and return as a single combined string (for simpler storage)
   * Format: iv:tag:encrypted
   */
  encryptCombined(plaintext: string): string {
    const { encrypted, iv, tag } = this.encrypt(plaintext);
    return `${iv}:${tag}:${encrypted}`;
  }

  /**
   * Decrypt a combined encrypted string
   */
  decryptCombined(combined: string): string {
    const parts = combined.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    return this.decrypt({
      iv: parts[0],
      tag: parts[1],
      encrypted: parts[2],
    });
  }

  /**
   * Generate a secure random key for use as ENCRYPTION_KEY
   * Returns 64 hex characters (32 bytes)
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
