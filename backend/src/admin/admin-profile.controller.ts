import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsDateString, IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminProfileService } from './admin-profile.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_AVATAR_BYTES } from './avatar-storage.service';

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
  @Get('avatar')
  async image(@Req() req: OwnAccountRequest, @Res() res: Response) {
    const bytes = await this.profiles.image(req.user.userId);
    res.set({
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline; filename="avatar.webp"',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    });
    res.send(bytes);
  }
  @Post('avatar')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: {
        fileSize: MAX_AVATAR_BYTES,
        files: 1,
        fields: 1,
        parts: 2,
        fieldSize: 128,
      },
    }),
  )
  upload(
    @Req() req: OwnAccountRequest,
    @Body() dto: ProfileVersionDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file?.buffer)
      throw new BadRequestException('A profile photo is required');
    return this.profiles.changeAvatar(
      req.user.userId,
      dto.expectedUpdatedAt,
      file,
    );
  }
  @Post('avatar/remove')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  remove(@Req() req: OwnAccountRequest, @Body() dto: ProfileVersionDto) {
    return this.profiles.changeAvatar(req.user.userId, dto.expectedUpdatedAt);
  }
}
