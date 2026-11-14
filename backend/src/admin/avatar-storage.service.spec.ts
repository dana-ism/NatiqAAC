import {
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import {
  AvatarStorageService,
  MAX_AVATAR_BYTES,
} from './avatar-storage.service';

const owner = 'b0308d71-3645-464e-a2f6-799dd0243e81';
const other = 'a7d8c6ea-a834-4619-a709-f1c4a90a4a7a';
const key = `${owner}/721994cd-9a26-4c71-9202-509ef72f61e0.webp`;
const metadata = () =>
  Response.json({
    id: 'admin-profile-avatars',
    name: 'admin-profile-avatars',
    public: false,
  });
const pixels = () =>
  sharp({
    create: { width: 32, height: 24, channels: 3, background: '#194b49' },
  });
describe('Bounded private own-avatar storage', () => {
  let values: Record<string, string>;
  let service: AvatarStorageService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    values = {
      SUPABASE_URL: 'https://synthetic-avatar.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-avatar-only-secret',
      ADMIN_AVATAR_BUCKET: 'admin-profile-avatars',
      SPECIALIST_DOCUMENT_BUCKET: 'specialist-documents',
    };
    service = new AvatarStorageService(new ConfigService(values));
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected synthetic request'));
  });
  afterEach(() => jest.restoreAllMocks());
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)(
    'decodes %s, strips metadata and returns static bounded WebP',
    async (format, mime) => {
      const input = await pixels()
        .withExif({ IFD0: { Copyright: 'Synthetic private metadata' } })
        .toFormat(format)
        .toBuffer();
      const output = await service.normalize(input, mime);
      const decoded = await sharp(output).metadata();
      expect(decoded.format).toBe('webp');
      expect(decoded.width).toBeLessThanOrEqual(512);
      expect(decoded.height).toBeLessThanOrEqual(512);
      expect(decoded.exif).toBeUndefined();
      expect(decoded.icc).toBeUndefined();
      expect(decoded.xmp).toBeUndefined();
      expect(decoded.pages ?? 1).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    Buffer.from('GIF89a'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(0),
    Buffer.alloc(MAX_AVATAR_BYTES + 1),
  ])(
    'rejects vectors, malformed and oversized input before Storage',
    async (bytes) => {
      await expect(
        service.upload(bytes, 'image/png', owner),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('rejects MIME disagreement and excessive dimensions', async () => {
    const png = await pixels().png().toBuffer();
    await expect(service.normalize(png, 'image/jpeg')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const large = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(service.normalize(large, 'image/png')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('rejects explicit APNG/WebP animation chunks', async () => {
    const png = await pixels().png().toBuffer();
    const chunk = Buffer.alloc(20);
    chunk.writeUInt32BE(8);
    chunk.write('acTL', 4);
    await expect(
      service.normalize(
        Buffer.concat([png.subarray(0, 8), chunk, png.subarray(8)]),
        'image/png',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const webp = await pixels().webp().toBuffer();
    const anim = Buffer.alloc(14);
    anim.write('ANIM');
    anim.writeUInt32LE(6, 4);
    await expect(
      service.normalize(
        Buffer.concat([webp.subarray(0, 12), anim, webp.subarray(12)]),
        'image/webp',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('uploads only re-encoded bytes to a verified private separate bucket', async () => {
    const input = await pixels().png().toBuffer();
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json({ Key: 'untrusted-provider-key' }));
    const saved = await service.upload(input, 'image/png', owner);
    expect(saved).toMatch(new RegExp(`^${owner}/[0-9a-f-]{36}\\.webp$`));
    expect(saved).not.toContain('untrusted');
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(
      `https://synthetic-avatar.supabase.co/storage/v1/object/admin-profile-avatars/${saved}`,
    );
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'image/webp',
        'x-upsert': 'false',
        'Cache-Control': 'no-store',
      },
    });
    expect(
      (await sharp(Buffer.from(options!.body as Uint8Array)).metadata()).format,
    ).toBe('webp');
  });
  it.each([true, 'false', undefined])(
    'refuses non-private/ambiguous bucket metadata %j',
    async (publicValue) => {
      fetchMock.mockResolvedValueOnce(
        Response.json({
          id: 'admin-profile-avatars',
          name: 'admin-profile-avatars',
          public: publicValue,
        }),
      );
      await expect(
        service.upload(await pixels().png().toBuffer(), 'image/png', owner),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('refuses a bucket shared with specialist documents', async () => {
    values.SPECIALIST_DOCUMENT_BUCKET = 'admin-profile-avatars';
    service = new AvatarStorageService(new ConfigService(values));
    await expect(
      service.upload(await pixels().png().toBuffer(), 'image/png', owner),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('retrieves only the server-stored own key via authenticated Storage', async () => {
    const image = await pixels().webp().toBuffer();
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response(new Uint8Array(image)));
    expect(await service.download(key, owner)).toEqual(image);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://synthetic-avatar.supabase.co/storage/v1/object/authenticated/admin-profile-avatars/${key}`,
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(
      '/object/public/',
    );
  });
  it.each([
    `${other}/721994cd-9a26-4c71-9202-509ef72f61e0.webp`,
    '../photo.webp',
    'https://example.com/photo.webp',
    `${owner}/photo.svg`,
  ])('rejects foreign or arbitrary references %s', async (reference) => {
    await expect(service.download(reference, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove(reference, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not return corrupt bytes disguised with a WebP signature', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response('RIFF0000WEBPcorrupt'));
    await expect(service.download(key, owner)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('removes exactly the generated own key, never a caller-controlled prefix', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json([]));
    await service.remove(key, owner);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ prefixes: [key] }),
    });
  });
  it('reports cleanup outages without logging owner keys or provider exceptions', async () => {
    jest
      .spyOn(service, 'remove')
      .mockRejectedValue(new Error('synthetic-secret-error'));
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    await service.cleanup(key, owner);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(
      /synthetic-secret-error|b0308d71|721994cd/,
    );
  });
  it('never deletes an existing object after a definite upload collision', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(new Response('', { status: 409 }));
    await expect(
      service.upload(await pixels().png().toBuffer(), 'image/png', owner),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('cleans an ambiguous failed upload and returns only sanitized failure', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(
        new Response('sensitive provider failure', { status: 500 }),
      )
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json([]));
    await expect(
      service.upload(await pixels().png().toBuffer(), 'image/png', owner),
    ).rejects.toThrow('Private avatar storage is temporarily unavailable');
    expect(fetchMock.mock.calls[3][1]?.method).toBe('DELETE');
  });
});
