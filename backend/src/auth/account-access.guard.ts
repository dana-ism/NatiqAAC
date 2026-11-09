import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export interface AccountIdentity {
  userId: string;
  email: string;
  role: string;
  emailVerified: boolean;
  legacyAuthExempt: boolean;
}
@Injectable()
export class AccountAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{
        headers: { authorization?: string };
        user: AccountIdentity;
      }>();
    const value = request.headers.authorization;
    if (!value?.startsWith('Bearer ')) throw new UnauthorizedException();
    let claims: { sub?: unknown; exp?: unknown; purpose?: unknown };
    try {
      claims = await this.jwt.verifyAsync(value.slice(7), {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof claims.sub !== 'string' ||
      !isUUID(claims.sub) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      (claims.purpose !== undefined && claims.purpose !== 'onboarding')
    )
      throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    request.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
      legacyAuthExempt: user.legacyAuthExempt,
    };
    return true;
  }
}
