import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary configured successfully');
    } else {
      this.logger.warn('Cloudinary not configured - image uploads will use local storage fallback');
    }
  }

  async uploadBase64Image(
    base64Data: string,
    options: {
      folder?: string;
      publicId?: string;
      transformation?: Record<string, unknown>;
    } = {}
  ): Promise<CloudinaryUploadResult> {
    if (!this.isConfigured) {
      throw new BadRequestException('Cloudinary is not configured');
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        base64Data,
        {
          folder: options.folder || 'templates/thumbnails',
          public_id: options.publicId,
          resource_type: 'image',
          transformation: options.transformation || [
            { width: 600, height: 400, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' },
          ],
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            this.logger.error('Cloudinary upload failed', error);
            reject(new BadRequestException(`Failed to upload image: ${error.message}`));
            return;
          }

          if (!result) {
            reject(new BadRequestException('Cloudinary upload returned empty result'));
            return;
          }

          resolve({
            url: result.url,
            secureUrl: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
    });
  }

  async deleteImage(publicId: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary not configured, skipping delete');
      return false;
    }

    return new Promise((resolve) => {
      cloudinary.uploader.destroy(
        publicId,
        (error: Error | undefined, result: { result: string } | undefined) => {
          if (error) {
            this.logger.error('Failed to delete image from Cloudinary', error);
            resolve(false);
            return;
          }
          resolve(result?.result === 'ok');
        }
      );
    });
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}
