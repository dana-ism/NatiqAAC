import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  DOCUMENT_STORAGE_TIMEOUT_MS,
  DocumentStorageService,
  MAX_SPECIALIST_DOCUMENT_BYTES,
} from './document-storage.service';

const OWNER = '2f2b8b97-dc84-4d83-b24c-f7c7650e2d32';
const OBJECT = '90c5e48e-c561-4a54-9c94-f3549b2e7d79';
const KEY = `${OWNER}/${OBJECT}.pdf`;
const PDF = Buffer.from('%PDF-1.7\nsynthetic test fixture\n%%EOF\n');
const metadata = () =>
  Response.json({
    id: 'specialist-documents',
    name: 'specialist-documents',
    public: false,
  });
const documentResponse = (
  data: Buffer = PDF,
  headers: Record<string, string> = {},
) => new Response(new Uint8Array(data), { status: 200, headers });

describe('Private specialist document storage', () => {
  let values: Record<string, string>;
  let service: DocumentStorageService;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    values = {
      SUPABASE_URL: 'https://synthetic-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-only-secret',
      SPECIALIST_DOCUMENT_BUCKET: 'specialist-documents',
    };
    service = new DocumentStorageService(new ConfigService(values));
    fetchMock = jest.spyOn(globalThis, 'fetch');
    // Every fetch is mocked; unexpected requests cannot reach any real service.
    fetchMock.mockRejectedValue(new Error('Unexpected mocked request'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('verifies private bucket and uploads a PDF with a random key and digest', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json({ Key: 'ignored-provider-path' }));
    const result = await service.upload(PDF, OWNER);
    expect(result).toEqual({
      key: expect.stringMatching(new RegExp(`^${OWNER}/[0-9a-f-]{36}\\.pdf$`)),
      size: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://synthetic-project.supabase.co/storage/v1/bucket/specialist-documents',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://synthetic-project.supabase.co/storage/v1/object/specialist-documents/${result.key}`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: new Uint8Array(PDF),
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-test-only-secret',
          apikey: 'synthetic-test-only-secret',
          'Content-Type': 'application/pdf',
          'x-upsert': 'false',
        }),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).not.toContain(
      'synthetic-test-only-secret',
    );
  });

  it('creates different object names on repeated uploads', async () => {
    fetchMock.mockImplementation(async (_url, options) =>
      options?.method === 'POST' ? Response.json({}) : metadata(),
    );
    const first = await service.upload(PDF, OWNER);
    const second = await service.upload(PDF, OWNER);
    expect(first.key).not.toBe(second.key);
  });

  it('stores compressible PDFs as smaller gzip objects without changing their bytes', async () => {
    const original = Buffer.from(
      `%PDF-1.7\n${'synthetic qualification\n'.repeat(2000)}%%EOF\n`,
    );
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json({}));
    const result = await service.upload(original, OWNER);
    const stored = Buffer.from(fetchMock.mock.calls[1][1]?.body as Uint8Array);
    expect(result.key).toMatch(/\.pdf\.gz$/u);
    expect(stored.length).toBeLessThan(original.length);
    expect(gunzipSync(stored)).toEqual(original);
    expect(result.size).toBe(original.length);
    expect(result.sha256).toBe(
      createHash('sha256').update(original).digest('hex'),
    );
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'Content-Type': 'application/gzip',
    });
  });

  it('transparently restores compressed documents for existing PDF download callers', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(documentResponse(gzipSync(PDF)));
    await expect(service.download(`${KEY}.gz`)).resolves.toEqual(PDF);
  });

  it('rejects compressed documents expanding beyond the original upload limit', async () => {
    const expanded = Buffer.alloc(MAX_SPECIALIST_DOCUMENT_BYTES + 1, 65);
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(documentResponse(gzipSync(expanded)));
    await expect(service.download(`${KEY}.gz`)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it.each([Buffer.from('broken gzip'), gzipSync(Buffer.from('not PDF'))])(
    'rejects corrupt or non-PDF compressed content',
    async (stored) => {
      fetchMock
        .mockResolvedValueOnce(metadata())
        .mockResolvedValueOnce(documentResponse(stored));
      await expect(service.download(`${KEY}.gz`)).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );

  it('uploads the validated snapshot if the caller mutates its buffer while metadata loads', async () => {
    let resolveMetadata!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const data = Buffer.from(PDF);
    const result = service.upload(data, OWNER);
    data.fill(0);
    resolveMetadata(metadata());
    await expect(result).resolves.toMatchObject({
      sha256: createHash('sha256').update(PDF).digest('hex'),
    });
    expect(fetchMock.mock.calls[1][1]?.body).toEqual(new Uint8Array(PDF));
  });

  it('accepts exactly 5 MiB and binary NUL inside a PDF', async () => {
    const data = Buffer.alloc(MAX_SPECIALIST_DOCUMENT_BYTES);
    data.write('%PDF-1.7\n');
    data.write('%%EOF', data.length - 5);
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json({}));
    await expect(service.upload(data, OWNER)).resolves.toMatchObject({
      size: MAX_SPECIALIST_DOCUMENT_BYTES,
    });
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from('not a PDF'),
    Buffer.concat([Buffer.from([0xa5]), Buffer.from('PDF-1.7\n%%EOF')]),
    Buffer.from('%PDF-1.7\nmissing eof'),
    Buffer.from('%PDF-1.7\n%%EOF\n<script>bad</script>'),
    Buffer.from('before%PDF-1.7\n%%EOF'),
    Buffer.concat([Buffer.from('%PDF-1.7\n%%EOF'), Buffer.alloc(1024)]),
    Buffer.alloc(MAX_SPECIALIST_DOCUMENT_BYTES + 1),
  ])(
    'rejects invalid/oversized content before any network request',
    async (data) => {
      await expect(service.upload(data, OWNER)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    '../owner',
    'arbitrary-user',
    OWNER.toUpperCase(),
    `${OWNER}/x`,
    '',
  ])('rejects invalid owner %s', async (owner) => {
    await expect(service.upload(PDF, owner)).rejects.toThrow(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SPECIALIST_DOCUMENT_BUCKET',
  ])('disables storage when %s is absent', async (name) => {
    delete values[name];
    await expect(service.upload(PDF, OWNER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['SUPABASE_URL', 'http://project.supabase.co'],
    ['SUPABASE_URL', 'https://user:password@project.supabase.co'],
    ['SUPABASE_URL', 'https://project.supabase.co/path'],
    ['SUPABASE_URL', 'https://project.supabase.co?token=secret'],
    ['SUPABASE_URL', 'https://project.supabase.co#fragment'],
    ['SPECIALIST_DOCUMENT_BUCKET', '../public'],
  ])('rejects unsafe configuration %s', async (name, value) => {
    values[name] = value;
    await expect(service.upload(PDF, OWNER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { id: 'specialist-documents', name: 'specialist-documents', public: true },
    { id: 'wrong', name: 'specialist-documents', public: false },
    { id: 'specialist-documents', name: 'wrong', public: false },
    { id: 'specialist-documents', name: 'specialist-documents' },
    {
      id: 'specialist-documents',
      name: 'specialist-documents',
      public: 'false',
    },
  ])(
    'fails closed when bucket privacy metadata is unsuitable',
    async (data) => {
      fetchMock.mockResolvedValueOnce(Response.json(data));
      await expect(service.upload(PDF, OWNER)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rechecks privacy on downloads and uploads instead of trusting an earlier private verdict', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(Response.json({}));
    await service.upload(PDF, OWNER);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: 'specialist-documents',
        name: 'specialist-documents',
        public: true,
      }),
    );
    await expect(service.download(KEY)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('bounds metadata bodies even when content length is absent', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(16 * 1024 + 1)));
    await expect(service.upload(PDF, OWNER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 500])(
    'sanitizes bucket failures %s',
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        new Response('private provider diagnostics', { status }),
      );
      await expect(service.upload(PDF, OWNER)).rejects.toMatchObject({
        response: {
          statusCode: 503,
          message: 'Private document storage is temporarily unavailable',
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry or delete after uncertain upload failure', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockRejectedValueOnce(new Error('private transport details'));
    await expect(service.upload(PDF, OWNER)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE'),
    ).toBe(false);
  });

  it('bounds total storage duration and aborts pending network work', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const result = service.upload(PDF, OWNER);
    const rejection = expect(result).rejects.toThrow(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(DOCUMENT_STORAGE_TIMEOUT_MS);
    await rejection;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('downloads through authenticated object endpoint with a private bucket check', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(documentResponse());
    await expect(service.download(KEY)).resolves.toEqual(PDF);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://synthetic-project.supabase.co/storage/v1/object/authenticated/specialist-documents/${KEY}`,
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });

  it.each([
    '../secret',
    `${OWNER}/../document.pdf`,
    `${OWNER}/${OBJECT}.html`,
    `${OWNER}/${OBJECT}.pdf?token=x`,
    `${OWNER}/${OBJECT}.pdf/extra`,
    `public/${KEY}`,
    `https://attacker.invalid/${KEY}`,
    KEY.toUpperCase(),
  ])('rejects invalid reference %s before network', async (key) => {
    await expect(service.download(key)).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized declared content before reading it', async () => {
    fetchMock.mockResolvedValueOnce(metadata()).mockResolvedValueOnce(
      documentResponse(PDF, {
        'Content-Length': String(MAX_SPECIALIST_DOCUMENT_BYTES + 1),
      }),
    );
    await expect(service.download(KEY)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects oversized streamed content despite absent or incorrect content length', async () => {
    const cancel = jest.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_SPECIALIST_DOCUMENT_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(
        new Response(stream, { headers: { 'Content-Length': '1' } }),
      );
    await expect(service.download(KEY)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects corrupt stored content without returning it as a PDF', async () => {
    fetchMock
      .mockResolvedValueOnce(metadata())
      .mockResolvedValueOnce(
        documentResponse(Buffer.from('<html>not PDF</html>')),
      );
    await expect(service.download(KEY)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
