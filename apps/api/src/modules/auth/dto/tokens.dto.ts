import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class TokensDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Access token expiration time in seconds' })
  expiresIn: number;

  @ApiProperty({ description: 'Token type', default: 'Bearer' })
  tokenType: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token to get new access token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AccessTokenPayload {
  sub: string; // user id
  email: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export class RefreshTokenPayload {
  sub: string; // user id
  tenantId: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
