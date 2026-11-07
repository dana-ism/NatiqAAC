import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

@Catch(HttpException)
export class AccountLockFilter extends BaseExceptionFilter {
  override catch(exception: HttpException, host: ArgumentsHost): void {
    const body = exception.getResponse();
    if (
      exception.getStatus() === 429 &&
      typeof body === 'object' &&
      body !== null &&
      'retryAfterSeconds' in body &&
      typeof body.retryAfterSeconds === 'number'
    ) {
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', body.retryAfterSeconds);
    }
    super.catch(exception, host);
  }
}
