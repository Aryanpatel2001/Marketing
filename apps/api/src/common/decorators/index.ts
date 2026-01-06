import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

// ============================================
// Current User Decorator
// ============================================

export const CurrentUser = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user;

  return data ? user?.[data] : user;
});

// ============================================
// Current Tenant Decorator
// ============================================

export const CurrentTenant = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId;
});

// ============================================
// Roles Decorator
// ============================================

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// ============================================
// Public Route Decorator
// ============================================

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ============================================
// API Key Auth Decorator
// ============================================

export const API_KEY_AUTH_KEY = 'apiKeyAuth';
export const ApiKeyAuth = () => SetMetadata(API_KEY_AUTH_KEY, true);

// ============================================
// Pagination Swagger Decorator
// ============================================

export function ApiPagination() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' }),
    ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' }),
    ApiQuery({ name: 'sortBy', required: false, type: String, description: 'Sort field' }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      description: 'Sort order',
    }),
    ApiQuery({ name: 'search', required: false, type: String, description: 'Search query' })
  );
}

// ============================================
// Response Message Decorator
// ============================================

export const RESPONSE_MESSAGE_KEY = 'response_message';
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);
