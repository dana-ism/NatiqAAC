
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';
import { createHash } from 'node:crypto';
import { RedisToken } from '@nestjs-redis/client';
import type { RedisClientType } from 'redis';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts = 5;
  private readonly initialLockSeconds = 30;
  private readonly maxLockSeconds = 24 * 60 * 60;
  private readonly attemptsWindowSeconds = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Inject(RedisToken())
    private readonly redis: RedisClientType,
  ) {}

  private validatePasswordLength(password: string): void {
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 bytes',
      );
    }
  }

  private getLoginKeys(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const emailHash = createHash('sha256')
      .update(normalizedEmail)
      .digest('hex');

    const prefix = `auth:login:${emailHash}`;

    return {
      failuresKey: `${prefix}:failures`,
      stageKey: `${prefix}:stage`,
      lockKey: `${prefix}:lock`,
    };
  }

  private createLockException(seconds: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many failed login attempts. Try again in ${seconds} seconds.`,
        retryAfterSeconds: seconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async checkAccountLock(email: string): Promise<void> {
    const { lockKey } = this.getLoginKeys(email);

    const ttl = await this.redis.ttl(lockKey);

    if (ttl > 0) {
      throw this.createLockException(ttl);
    }
  }

  private async recordFailedLogin(email: string): Promise<void> {
    const {
      failuresKey,
      stageKey,
      lockKey,
    } = this.getLoginKeys(email);

    const script = `
      local maxAttempts = tonumber(ARGV[1])
      local initialLockSeconds = tonumber(ARGV[2])
      local maxLockSeconds = tonumber(ARGV[3])
      local attemptsWindowSeconds = tonumber(ARGV[4])

      local lockTtl = redis.call('TTL', KEYS[3])

      if lockTtl > 0 then
        return lockTtl
      end

      local stage = redis.call('GET', KEYS[2])

      if stage then
        local maxStage = math.ceil(
          math.log(maxLockSeconds / initialLockSeconds) / math.log(2)
        ) + 1

        local nextStage = math.min(
          tonumber(stage) + 1,
          maxStage
        )

        local duration = math.min(
          initialLockSeconds * (2 ^ (nextStage - 1)),
          maxLockSeconds
        )

        redis.call('SET', KEYS[2], tostring(nextStage))
        redis.call('SET', KEYS[3], '1', 'EX', duration)
        redis.call('DEL', KEYS[1])

        return duration
      end

      local attempts = redis.call('INCR', KEYS[1])

      if attempts == 1 then
        redis.call('EXPIRE', KEYS[1], attemptsWindowSeconds)
      end

      if attempts >= maxAttempts then
        redis.call('SET', KEYS[2], '1')
        redis.call('SET', KEYS[3], '1', 'EX', initialLockSeconds)
        redis.call('DEL', KEYS[1])

        return initialLockSeconds
      end

      return 0
    `;

    const lockDuration = Number(
      await this.redis.eval(script, {
        keys: [failuresKey, stageKey, lockKey],
        arguments: [
          String(this.maxLoginAttempts),
          String(this.initialLockSeconds),
          String(this.maxLockSeconds),
          String(this.attemptsWindowSeconds),
        ],
      }),
    );

    if (lockDuration > 0) {
      throw this.createLockException(lockDuration);
    }
  }

  private async resetLoginAttempts(email: string): Promise<void> {
    const {
      failuresKey,
      stageKey,
      lockKey,
    } = this.getLoginKeys(email);

    await this.redis.del([
      failuresKey,
      stageKey,
      lockKey,
    ]);
  }

  async register(registerDto: RegisterDto) {
    this.validatePasswordLength(registerDto.password);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(registerDto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: registerDto.fullName,
          email: registerDto.email,
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
    await this.checkAccountLock(loginDto.email);

    this.validatePasswordLength(loginDto.password);

    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      await this.recordFailedLogin(loginDto.email);

      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const isPasswordValid = await compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.recordFailedLogin(loginDto.email);

      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('Account is not active');
    }

    await this.resetLoginAttempts(loginDto.email);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

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
