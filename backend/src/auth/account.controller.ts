import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AccountLifecycleService } from './account-lifecycle.service';
import {
  AccountAccessGuard,
  type AccountIdentity,
} from './account-access.guard';
import {
  ParentRegistrationDto,
  SpecialistRegistrationDto,
  ResendVerificationDto,
  VerifyEmailDto,
} from './dto/account.dto';

@Controller('auth')
export class AccountController {
  constructor(private readonly accounts: AccountLifecycleService) {}
  @Post('register/parent')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  parent(@Body() dto: ParentRegistrationDto) {
    return this.accounts.register(dto, 'PARENT');
  }
  @Post('register/specialist')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  specialist(@Body() dto: SpecialistRegistrationDto) {
    return this.accounts.register(dto, 'SPECIALIST');
  }
  @Post('email/verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() dto: VerifyEmailDto) {
    return this.accounts.verify(dto.token);
  }
  @Post('email/resend-verification')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resend(@Body() dto: ResendVerificationDto) {
    return this.accounts.resend(dto.email);
  }
  @Get('onboarding/me')
  @UseGuards(AccountAccessGuard)
  me(@Req() req: { user: AccountIdentity }) {
    return req.user;
  }
}
