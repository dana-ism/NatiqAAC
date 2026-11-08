import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/client';
import { ROLES_KEY } from '../roles.decorator';

// Must run AFTER JwtAuthGuard: request.user is the current database identity.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest<{
      user?: { role: UserRole };
    }>();
    // Fail closed if an Admin controller forgets its role metadata.
    return !!user && !!roles?.length && roles.includes(user.role);
  }
}
