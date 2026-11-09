import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  OAuthController,
  OAuthFinishDto,
  OAuthStartDto,
  OAuthLinkStartDto,
} from './oauth.controller';
import { OAuthFlowService } from './oauth-flow.service';
import { OAuthAccountsService } from './oauth-accounts.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import type { Response } from 'express';

describe('OAuthController', () => {
  let controller: OAuthController;
  let flow: {
    start: jest.Mock;
    startLink: jest.Mock;
    callback: jest.Mock;
    finish: jest.Mock;
  };
  let accounts: { complete: jest.Mock };
  let lifecycle: { publicOrigin: jest.Mock };
  let response: {
    set: jest.Mock;
    status: jest.Mock;
    type: jest.Mock;
    send: jest.Mock;
  };
  beforeEach(() => {
    flow = {
      start: jest.fn(),
      startLink: jest.fn(),
      callback: jest.fn().mockResolvedValue('c'.repeat(43)),
      finish: jest.fn().mockResolvedValue({
        identity: { subject: 'synthetic-subject' },
        intent: 'login',
      }),
    };
    accounts = {
      complete: jest
        .fn()
        .mockResolvedValue({ access_token: 'synthetic-platform-token' }),
    };
    lifecycle = {
      publicOrigin: jest.fn().mockReturnValue('https://app.example.org'),
    };
    controller = new OAuthController(
      flow as unknown as OAuthFlowService,
      accounts as unknown as OAuthAccountsService,
      lifecycle as unknown as AccountLifecycleService,
    );
    response = {
      set: jest.fn(),
      status: jest.fn(),
      type: jest.fn(),
      send: jest.fn(),
    };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
  });
  it('sends a completion identifier only to a fixed origin with nonce CSP and no caching', async () => {
    await controller.google(
      'synthetic-code',
      's'.repeat(43),
      undefined,
      response as unknown as Response,
    );
    expect(flow.callback).toHaveBeenCalledWith(
      'GOOGLE',
      'synthetic-code',
      's'.repeat(43),
    );
    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain('"type":"natiqaac-oauth"');
    expect(html).toContain('"completionId":"' + 'c'.repeat(43));
    expect(html).toContain('"https://app.example.org"');
    expect(html).not.toContain('synthetic-code');
    expect(html).not.toContain('access_token');
    const headers = response.set.mock.calls[0][0] as Record<string, string>;
    const nonce = /nonce="([^"]+)"/.exec(html)![1];
    expect(headers['Content-Security-Policy']).toContain(
      `script-src 'nonce-${nonce}'`,
    );
    expect(headers['Cache-Control']).toBe('no-store');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });
  it('returns generic provider cancellation without reflecting provider error strings', async () => {
    await controller.facebook(
      'code',
      'state',
      '<script>secret</script>',
      response as unknown as Response,
    );
    expect(flow.callback).not.toHaveBeenCalled();
    const html = response.send.mock.calls[0][0] as string;
    expect(html).toContain('"error":true');
    expect(html).not.toContain('secret');
  });
  it('does not expose callback exceptions to the browser', async () => {
    flow.callback.mockRejectedValue(new Error('secret provider URL'));
    await controller.google(
      'code',
      'state',
      undefined,
      response as unknown as Response,
    );
    expect(response.send.mock.calls[0][0]).not.toContain('secret');
  });
  it('checks configured completion origin before initiating OAuth', () => {
    lifecycle.publicOrigin.mockImplementation(() => {
      throw new BadRequestException();
    });
    expect(() =>
      controller.start({
        provider: 'GOOGLE',
        intent: 'login',
        challenge: 'x'.repeat(43),
      }),
    ).toThrow(BadRequestException);
    expect(flow.start).not.toHaveBeenCalled();
  });
  it('derives link account identity from authenticated request rather than body', async () => {
    await controller.startLink(
      { provider: 'GOOGLE', challenge: 'x'.repeat(43) },
      {
        user: {
          userId: 'authenticated-user',
          email: 'parent@example.org',
          role: 'PARENT',
          emailVerified: true,
          legacyAuthExempt: false,
        },
      },
    );
    expect(flow.startLink).toHaveBeenCalledWith(
      'GOOGLE',
      'x'.repeat(43),
      'authenticated-user',
    );
  });
  it('completes account work only after consuming valid browser proof', async () => {
    const dto = { completionId: 'c'.repeat(43), verifier: 'v'.repeat(43) };
    expect(await controller.finish(dto)).toEqual({
      access_token: 'synthetic-platform-token',
    });
    expect(accounts.complete).toHaveBeenCalledWith(
      await flow.finish.mock.results[0].value,
      dto,
    );
  });
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it('rejects ADMIN/role/status/linkUserId injection before consuming transaction', async () => {
    for (const [metatype, value] of [
      [
        OAuthStartDto,
        {
          provider: 'GOOGLE',
          intent: 'register',
          role: 'ADMIN',
          challenge: 'x'.repeat(43),
        },
      ],
      [
        OAuthLinkStartDto,
        { provider: 'GOOGLE', challenge: 'x'.repeat(43), userId: 'victim' },
      ],
      [
        OAuthFinishDto,
        {
          completionId: 'c'.repeat(43),
          verifier: 'v'.repeat(43),
          status: 'ACTIVE',
        },
      ],
    ] as const) {
      await expect(
        pipe.transform(value, { type: 'body', metatype }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(flow.finish).not.toHaveBeenCalled();
  });
  it('rejects malformed completion data and trims validated professional fields', async () => {
    await expect(
      pipe.transform(
        { completionId: 'short', verifier: 'v'.repeat(43) },
        { type: 'body', metatype: OAuthFinishDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        {
          completionId: 'c'.repeat(43),
          verifier: 'v'.repeat(43),
          email: 'invalid',
        },
        { type: 'body', metatype: OAuthFinishDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const valid = await pipe.transform(
      {
        completionId: 'c'.repeat(43),
        verifier: 'v'.repeat(43),
        qualification: '  Degree  ',
      },
      { type: 'body', metatype: OAuthFinishDto },
    );
    expect(valid.qualification).toBe('Degree');
  });
});
