import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { LoginProtectionService } from './login-protection.service';
import { normalizeEmail } from './normalize-email';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  // Random synthetic credential: never belongs to a real user and is not logged.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly protection: LoginProtectionService,
  ) {}

  private validatePasswordLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('Password must not exceed 72 bytes');
    }
  }

  async register(registerDto: RegisterDto) {
    this.validatePasswordLength(registerDto.password);

    const email = normalizeEmail(registerDto.email);
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(registerDto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: registerDto.fullName.trim(),
          email,
          passwordHash,
          role: 'PARENT',
          status: 'ACTIVE',
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      });

      return {
        message: 'Account registered successfully',
        user,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
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

    const isPasswordValid = await compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.protection.recordFailure(email);

      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    // Last asynchronous authorization step: do not clear a concurrently created lock.
    // A signed token is not returned if this fails.
    await this.protection.finalizeSuccess(email);

    return {
      message: 'Login successful',
      access_token: accessToken,
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
