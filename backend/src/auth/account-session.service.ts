import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}
  async issue(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { specialistApplication: true },
    });
    if (!user || user.status !== 'ACTIVE')
      throw new ForbiddenException('Account is not active');
    const restricted =
      !user.legacyAuthExempt &&
      (!user.emailVerifiedAt ||
        (user.role === 'SPECIALIST' &&
          user.specialistApplication?.status !== 'APPROVED'));
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(restricted ? { purpose: 'onboarding' } : {}),
    });
    return {
      message: restricted ? 'Account completion required' : 'Login successful',
      ...(restricted ? { onboarding_token: token } : { access_token: token }),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }
}
