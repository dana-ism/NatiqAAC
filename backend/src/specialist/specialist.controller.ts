import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AccountAccessGuard,
  type AccountIdentity,
} from '../auth/account-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReviewApplicationDto } from '../auth/dto/account.dto';
import { SpecialistService } from './specialist.service';
type AccountRequest = { user: AccountIdentity };

function attachment(res: Response, bytes: Buffer) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="qualification.pdf"',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "sandbox; default-src 'none'",
  });
  res.send(bytes);
}

@Controller('specialist/application')
@UseGuards(AccountAccessGuard, ThrottlerGuard)
export class SpecialistController {
  constructor(private readonly service: SpecialistService) {}
  @Get('me') mine(@Req() req: AccountRequest) {
    return this.service.mine(req.user.userId);
  }
  @Post('document')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Req() req: AccountRequest,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file?.buffer)
      throw new BadRequestException('A qualification PDF is required');
    return this.service.upload(req.user.userId, file.buffer);
  }
  @Post('submit') @HttpCode(200) submit(@Req() req: AccountRequest) {
    return this.service.submit(req.user.userId);
  }
  @Get('document') async document(
    @Req() req: AccountRequest,
    @Res() res: Response,
  ) {
    const app = await this.service.mine(req.user.userId);
    attachment(
      res,
      await this.service.document(app.id, req.user.userId, false),
    );
  }
}

@Controller('admin/specialist-applications')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles('ADMIN')
export class SpecialistAdminController {
  constructor(private readonly service: SpecialistService) {}
  @Get() list() {
    return this.service.list();
  }
  @Get(':id') details(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.details(id);
  }
  @Get(':id/document') async document(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AccountRequest,
    @Res() res: Response,
  ) {
    attachment(res, await this.service.document(id, req.user.userId, true));
  }
  @Post(':id/approve') @HttpCode(200) approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AccountRequest,
  ) {
    return this.service.review(id, req.user.userId, 'APPROVED');
  }
  @Post(':id/reject') @HttpCode(200) reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AccountRequest,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.service.review(id, req.user.userId, 'REJECTED', dto.reason);
  }
}
