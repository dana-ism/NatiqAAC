import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { isUUID, isEmail } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: unknown) {
    if (!payload || typeof payload !== 'object')
      throw new UnauthorizedException('Invalid token');
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims.sub !== 'string' ||
      !isUUID(claims.sub) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000 ||
      typeof claims.email !== 'string' ||
      !isEmail(claims.email) ||
      typeof claims.role !== 'string' ||
      !['PARENT', 'SPECIALIST', 'ADMIN'].includes(claims.role)
    ) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.prismaService.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
