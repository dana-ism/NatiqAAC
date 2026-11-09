import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisToken } from '@nestjs-redis/client';
import { AuthRateLimitStorage } from './auth-rate-limit.storage';
import { LoginProtectionService } from './login-protection.service';
import { ThrottlerModule } from '@nestjs/throttler';
import type { RedisClientType } from 'redis';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccountLifecycleService } from './account-lifecycle.service';
import { AccountAccessGuard } from './account-access.guard';
import { AccountSessionService } from './account-session.service';
import { AccountController } from './account.controller';
import { EmailDomainService } from './email-domain.service';
import { GmailMailerService } from '../mail/gmail-mailer.service';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthFlowService } from './oauth-flow.service';
import { OAuthAccountsService } from './oauth-accounts.service';
import { OAuthController } from './oauth.controller';
import { NotificationDispatchService } from '../mail/notification-dispatch.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,

    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: 900, algorithm: 'HS256' },
      }),
    }),

    ThrottlerModule.forRootAsync({
      inject: [RedisToken()],
      useFactory: (redisClient: RedisClientType) => ({
        storage: new AuthRateLimitStorage(redisClient),
        throttlers: [
          {
            name: 'default',
            limit: 20,
            ttl: 60_000,
          },
        ],
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    LoginProtectionService,
    AccountLifecycleService,
    AccountAccessGuard,
    AccountSessionService,
    EmailDomainService,
    GmailMailerService,
    OAuthProviderService,
    OAuthFlowService,
    OAuthAccountsService,
    NotificationDispatchService,
  ],
  controllers: [AuthController, AccountController, OAuthController],
  exports: [
    JwtAuthGuard,
    PassportModule,
    JwtModule,
    AccountAccessGuard,
    AccountLifecycleService,
    AccountSessionService,
    ThrottlerModule,
  ],
})
export class AuthModule {}
