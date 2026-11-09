import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { LoginProtectionService } from './login-protection.service';
import { normalizeEmail } from './normalize-email';

import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccountLifecycleService } from './account-lifecycle.service';

@Injectable()
export class AuthService {
  // Random synthetic credential: never belongs to a real user and is not logged.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly protection: LoginProtectionService,
    private readonly accounts: AccountLifecycleService,
  ) {}

  private validatePasswordLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 bytes');
    }
  }

  async register(registerDto: RegisterDto) {
    return this.accounts.register(registerDto, 'PARENT');
  }

  async login(loginDto: LoginDto) {
    const email = normalizeEmail(loginDto.email);
    await this.protection.check(email);

    this.validatePasswordLength(loginDto.password);

    // Read legacy identities without rewriting them. Never choose between collisions.
    const users = await this.prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      take: 2,
    });
    const user = users.length === 1 ? users[0] : undefined;

    if (!user) {
      await compare(
        loginDto.password,
        await (this.dummyHash ??= hash(randomBytes(32).toString('hex'), 12)),
      );
      await this.protection.recordFailure(email);

      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = user.passwordHash
      ? await compare(loginDto.password, user.passwordHash)
      : await compare(
          loginDto.password,
          await (this.dummyHash ??= hash(randomBytes(32).toString('hex'), 12)),
        ).then(() => false);

    if (!isPasswordValid) {
      await this.protection.recordFailure(email);

      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const application =
      user.role === 'SPECIALIST' && !user.legacyAuthExempt
        ? await this.prisma.specialistApplication.findUnique({
            where: { userId: user.id },
          })
        : null;
    const restricted =
      !user.legacyAuthExempt &&
      (!user.emailVerifiedAt ||
        (user.role === 'SPECIALIST' && application?.status !== 'APPROVED'));
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...(restricted ? { purpose: 'onboarding' } : {}),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    // Last asynchronous authorization step: do not clear a concurrently created lock.
    // A signed token is not returned if this fails.
    await this.protection.finalizeSuccess(email);

    return {
      message: restricted ? 'Account completion required' : 'Login successful',
      ...(restricted
        ? { onboarding_token: accessToken }
        : { access_token: accessToken }),
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
