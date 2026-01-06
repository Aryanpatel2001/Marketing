import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ description: 'Error code' })
  code: string;

  @ApiProperty({ description: 'Error message' })
  message: string;

  @ApiPropertyOptional({ description: 'Additional error details' })
  details?: Record<string, unknown>;
}

export class ApiResponseDto<T = unknown> {
  @ApiProperty({ description: 'Whether the request was successful' })
  success: boolean;

  @ApiPropertyOptional({ description: 'Response data' })
  data?: T;

  @ApiPropertyOptional({ description: 'Response message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Error details' })
  error?: ApiErrorDto;

  static success<T>(data: T, message?: string): ApiResponseDto<T> {
    const response = new ApiResponseDto<T>();
    response.success = true;
    response.data = data;
    if (message) response.message = message;
    return response;
  }

  static error(code: string, message: string, details?: Record<string, unknown>): ApiResponseDto {
    const response = new ApiResponseDto();
    response.success = false;
    response.error = { code, message, details };
    return response;
  }
}

export class MessageResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  constructor(success: boolean, message: string) {
    this.success = success;
    this.message = message;
  }
}
