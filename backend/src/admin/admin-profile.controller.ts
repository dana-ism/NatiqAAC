import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsDateString, IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminProfileService } from './admin-profile.service';

export class ProfileVersionDto {
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  expectedUpdatedAt: string;
}
export class AdminProfileNameDto extends ProfileVersionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  // eslint-disable-next-line no-control-regex -- Reject controls and bidi overrides in saved display names.
  @Matches(/^[^\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+$/u)
  fullName: string;
}
type OwnAccountRequest = { user: { userId: string } };

@Controller('admin/profile')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminProfileController {
  constructor(private readonly profiles: AdminProfileService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Req() req: OwnAccountRequest) {
    return this.profiles.get(req.user.userId);
  }

  @Post('name')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  rename(@Req() req: OwnAccountRequest, @Body() dto: AdminProfileNameDto) {
    return this.profiles.rename(
      req.user.userId,
      dto.fullName,
      dto.expectedUpdatedAt,
    );
  }
}
