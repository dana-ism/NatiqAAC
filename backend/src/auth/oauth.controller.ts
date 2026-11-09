import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { AccountLifecycleService } from './account-lifecycle.service';
import { OAuthAccountsService } from './oauth-accounts.service';
import { OAuthFlowService, type OAuthPublicRole } from './oauth-flow.service';
import type { OAuthProvider } from './oauth-provider.service';
import {
  AccountAccessGuard,
  type AccountIdentity,
} from './account-access.guard';

export class OAuthStartDto {
  @IsIn(['GOOGLE', 'FACEBOOK']) provider: OAuthProvider;
  @IsIn(['login', 'register']) intent: 'login' | 'register';
  @IsOptional() @IsIn(['PARENT', 'SPECIALIST']) role?: OAuthPublicRole;
  @Matches(/^[A-Za-z0-9_-]{43}$/) challenge: string;
}

export class OAuthLinkStartDto {
  @IsIn(['GOOGLE', 'FACEBOOK']) provider: OAuthProvider;
  @Matches(/^[A-Za-z0-9_-]{43}$/) challenge: string;
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class OAuthFinishDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) completionId: string;
  @Matches(/^[A-Za-z0-9_-]{43}$/) verifier: string;
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) fullName?: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) email?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 160)
  specialization?: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  qualification?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) summary?: string;
  @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
}

@Controller('auth/oauth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class OAuthController {
  constructor(
    private readonly flow: OAuthFlowService,
    private readonly accounts: OAuthAccountsService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Post('start')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  start(@Body() dto: OAuthStartDto) {
    // Check the configured completion origin before issuing a provider transaction.
    this.lifecycle.publicOrigin();
    return this.flow.start(dto);
  }

  @Post('link/start')
  @HttpCode(200)
  @UseGuards(AccountAccessGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  startLink(
    @Body() dto: OAuthLinkStartDto,
    @Req() request: { user: AccountIdentity },
  ) {
    this.lifecycle.publicOrigin();
    return this.flow.startLink(
      dto.provider,
      dto.challenge,
      request.user.userId,
    );
  }

  @Get('google/callback')
  google(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    return this.callback('GOOGLE', code, state, error, response);
  }

  @Get('facebook/callback')
  facebook(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ) {
    return this.callback('FACEBOOK', code, state, error, response);
  }

  @Post('finish')
  @HttpCode(200)
  async finish(@Body() dto: OAuthFinishDto) {
    const transaction = await this.flow.finish(dto.completionId, dto.verifier);
    return this.accounts.complete(transaction, dto);
  }

  private async callback(
    provider: OAuthProvider,
    code: string,
    state: string,
    error: string | undefined,
    response: Response,
  ) {
    const origin = this.lifecycle.publicOrigin();
    let message: { type: string; completionId?: string; error?: boolean };
    try {
      if (error !== undefined)
        throw new Error('Provider authorization cancelled');
      const completionId = await this.flow.callback(provider, code, state);
      message = { type: 'natiqaac-oauth', completionId };
    } catch {
      message = { type: 'natiqaac-oauth', error: true };
    }
    const nonce = randomBytes(24).toString('base64url');
    const encode = (value: unknown) =>
      JSON.stringify(value).replace(/</g, '\\u003c');
    response.set({
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    return response
      .status(200)
      .type('html')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>NatiqAAC</title></head><body><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${encode(message)},${encode(origin)});}window.close();</script></body></html>`,
      );
  }
}
