import { ConfigService } from '@nestjs/config';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProviderService } from './oauth-provider.service';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
  CodeChallengeMethod: { S256: 'S256' },
}));
const transaction = {
  state: 'synthetic-state',
  nonce: 'synthetic-nonce',
  codeVerifier: 'synthetic-verifier',
  codeChallenge: 'synthetic-challenge',
};
const environment = {
  GOOGLE_CLIENT_ID: 'synthetic-client',
  GOOGLE_CLIENT_SECRET: 'synthetic-secret',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3000/auth/google/callback',
  FACEBOOK_APP_ID: 'synthetic-app',
  FACEBOOK_APP_SECRET: 'synthetic-secret',
  FACEBOOK_REDIRECT_URI: 'https://api.example.org/auth/facebook/callback',
  FACEBOOK_GRAPH_VERSION: 'v99.0',
};
const future = () => Math.floor(Date.now() / 1000) + 300;
describe('OAuthProviderService', () => {
  let service: OAuthProviderService;
  let config: Record<string, string>;
  let claims: Record<string, unknown>;
  let google: {
    generateAuthUrl: jest.Mock;
    getToken: jest.Mock;
    verifyIdToken: jest.Mock;
  };
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.resetAllMocks();
    config = { ...environment };
    service = new OAuthProviderService({
      get: (key: string) => config[key],
    } as ConfigService);
    claims = {
      sub: 'synthetic-subject',
      aud: environment.GOOGLE_CLIENT_ID,
      iss: 'https://accounts.google.com',
      exp: future(),
      nonce: transaction.nonce,
      email: 'Parent@gmail.com',
      email_verified: true,
      name: 'Synthetic Parent',
    };
    google = {
      generateAuthUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/authorize'),
      getToken: jest
        .fn()
        .mockResolvedValue({ tokens: { id_token: 'synthetic-id-token' } }),
      verifyIdToken: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ getPayload: () => claims }),
        ),
    };
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => google);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  function facebook(
    profile: Record<string, unknown> = {
      id: 'synthetic-subject',
      name: 'Parent',
    },
    override: Record<string, unknown> = {},
  ) {
    for (const body of [
      { access_token: 'synthetic-provider-token', token_type: 'bearer' },
      {
        data: {
          is_valid: true,
          app_id: environment.FACEBOOK_APP_ID,
          user_id: 'synthetic-subject',
          expires_at: future(),
          data_access_expires_at: future(),
          ...override,
        },
      },
      profile,
    ]) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(body),
      });
    }
  }
  it('fails closed for unavailable provider credentials', async () => {
    delete config.GOOGLE_CLIENT_SECRET;
    expect(service.isConfigured('GOOGLE')).toBe(false);
    expect(() => service.createAuthorization('GOOGLE', transaction)).toThrow(
      ServiceUnavailableException,
    );
    await expect(
      service.exchange('GOOGLE', 'code', transaction),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    'http://public.example.org/callback',
    'https://user:secret@example.org/callback',
    'https://api.example.org/callback#fragment',
    'https://api.example.org/callback?next=evil',
  ])('rejects unsafe configured callback %s', (redirect) => {
    config.GOOGLE_REDIRECT_URI = redirect;
    expect(service.isConfigured('GOOGLE')).toBe(false);
  });
  it('requires explicit Facebook graph version', () => {
    delete config.FACEBOOK_GRAPH_VERSION;
    expect(service.isConfigured('FACEBOOK')).toBe(false);
  });
  it('uses Google code flow with state, nonce and S256', () => {
    service.createAuthorization('GOOGLE', transaction);
    expect(google.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        response_type: 'code',
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: transaction.codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'online',
      }),
    );
  });
  it('uses fixed Facebook callback and explicit graph version', () => {
    const url = new URL(service.createAuthorization('FACEBOOK', transaction));
    expect(url.pathname).toBe('/v99.0/dialog/oauth');
    expect(url.searchParams.get('redirect_uri')).toBe(
      environment.FACEBOOK_REDIRECT_URI,
    );
    expect(url.searchParams.get('state')).toBe(transaction.state);
    expect(url.searchParams.get('response_type')).toBe('code');
  });
  it('verifies Google identity with correct audience and exchanges PKCE server-side', async () => {
    expect(
      await service.exchange('GOOGLE', 'synthetic-code', transaction),
    ).toEqual({
      provider: 'GOOGLE',
      subject: 'synthetic-subject',
      email: 'parent@gmail.com',
      emailTrusted: true,
      fullName: 'Synthetic Parent',
    });
    expect(google.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'synthetic-id-token',
      audience: environment.GOOGLE_CLIENT_ID,
    });
    expect(google.getToken).toHaveBeenCalledWith({
      code: 'synthetic-code',
      codeVerifier: transaction.codeVerifier,
      redirect_uri: environment.GOOGLE_REDIRECT_URI,
    });
  });
  it.each([
    { nonce: 'different' },
    { exp: 1 },
    { sub: '' },
    { iss: 'https://attacker.example' },
    { aud: 'wrong-app' },
  ])('rejects invalid Google claims %j', async (patch) => {
    Object.assign(claims, patch);
    await expect(
      service.exchange('GOOGLE', 'code', transaction),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('requires local mailbox verification for third-party Google addresses', async () => {
    claims.email = 'parent@university.example';
    expect(
      (await service.exchange('GOOGLE', 'code', transaction)).emailTrusted,
    ).toBe(false);
    claims.hd = 'university.example';
    expect(
      (await service.exchange('GOOGLE', 'code', transaction)).emailTrusted,
    ).toBe(true);
    claims.email_verified = false;
    expect(
      (await service.exchange('GOOGLE', 'code', transaction)).emailTrusted,
    ).toBe(false);
  });
  it('sanitizes library validation errors without exposing credentials', async () => {
    google.verifyIdToken.mockRejectedValue(
      new Error('secret synthetic-provider-token'),
    );
    await expect(
      service.exchange('GOOGLE', 'code', transaction),
    ).rejects.toThrow('Provider authentication failed');
  });
  it('handles Facebook missing email and binds inspected subject to profile', async () => {
    facebook();
    expect(await service.exchange('FACEBOOK', 'code', transaction)).toEqual({
      provider: 'FACEBOOK',
      subject: 'synthetic-subject',
      email: undefined,
      emailTrusted: false,
      fullName: 'Parent',
    });
    const [url, init] = fetchMock.mock.calls[2] as [URL, RequestInit];
    expect(url.searchParams.get('appsecret_proof')).toMatch(/^[a-f0-9]{64}$/);
    expect(init.headers).toEqual({
      Authorization: 'Bearer synthetic-provider-token',
    });
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('never treats Facebook email as verified', async () => {
    facebook({
      id: 'synthetic-subject',
      email: 'Parent@example.org',
      name: 'Parent',
    });
    expect(
      (await service.exchange('FACEBOOK', 'code', transaction)).emailTrusted,
    ).toBe(false);
  });
  it.each([
    { is_valid: false },
    { app_id: 'other-app' },
    { expires_at: 1 },
    { data_access_expires_at: 1 },
    { user_id: '' },
  ])('rejects invalid Facebook inspection %j', async (patch) => {
    facebook(undefined, patch);
    await expect(
      service.exchange('FACEBOOK', 'code', transaction),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects Facebook profile identity substitution', async () => {
    facebook({ id: 'other-subject' });
    await expect(
      service.exchange('FACEBOOK', 'code', transaction),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('sanitizes provider network errors and disables redirects', async () => {
    fetchMock.mockRejectedValue(new Error('sensitive URL and token'));
    await expect(
      service.exchange('FACEBOOK', 'code', transaction),
    ).rejects.toThrow('Identity provider unavailable');
  });
});
