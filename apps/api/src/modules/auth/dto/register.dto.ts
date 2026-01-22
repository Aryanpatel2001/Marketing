import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email address' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'User password (min 8 chars, 1 uppercase, 1 lowercase, 1 number)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({ example: 'John', description: 'User first name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'User last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ example: 'Acme Inc', description: 'Company/Organization name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiProperty({
    example: '+14155551234',
    description: 'Phone number in international format (US: +1, EU: +44, +49, etc.)',
  })
  @IsString()
  @MinLength(10, { message: 'Phone number must be at least 10 characters' })
  @MaxLength(20)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Phone number must be in international format (e.g., +14155551234)',
  })
  phoneNumber: string;

  @ApiProperty({ example: true, description: 'Accept terms and conditions' })
  @IsBoolean()
  acceptTerms: boolean;
}
