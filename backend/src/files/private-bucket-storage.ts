import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export const PRIVATE_STORAGE_TIMEOUT_MS = 10_000;
const MAX_METADATA_BYTES = 16 * 1024;
export interface StorageConfiguration {
  origin: string;
  secret: string;
  bucket: string;
}
/** Shared private-bucket transport; callers enforce owner/key/content rules. */
export abstract class PrivateBucketStorage {
  protected constructor(
    private readonly config: ConfigService,
    private readonly bucketSetting: string,
    private readonly failureMessage: string,
    private readonly expectedBucket?: string,
    private readonly forbiddenBucketSetting?: string,
  ) {}
  protected settings(): StorageConfiguration {
    const origin = this.config.get<string>('SUPABASE_URL');
    const secret = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = this.config.get<string>(this.bucketSetting);
    if (
      !origin ||
      !secret ||
      !bucket ||
      (this.expectedBucket !== undefined && bucket !== this.expectedBucket) ||
      (this.forbiddenBucketSetting !== undefined &&
        bucket === this.config.get<string>(this.forbiddenBucketSetting)) ||
      !/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(bucket)
    ) {
      throw this.unavailable();
    }
    try {
      const url = new URL(origin);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.pathname !== '/' && url.pathname !== '')
      )
        throw new Error('Invalid storage origin');
      // Configuration errors must not expose credentials or the endpoint.
      return { origin: url.origin, secret, bucket };
    } catch {
      throw this.unavailable();
    }
  }

  protected headers(settings: StorageConfiguration): Record<string, string> {
    return {
      Authorization: `Bearer ${settings.secret}`,
      apikey: settings.secret,
    };
  }

  protected async assertPrivateBucket(
    settings: StorageConfiguration,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(
      `${settings.origin}/storage/v1/bucket/${settings.bucket}`,
      {
        method: 'GET',
        headers: this.headers(settings),
        redirect: 'error',
        signal,
      },
    );
    if (!response.ok) throw new Error('Storage bucket unavailable');
    const metadata = JSON.parse(
      (await this.readBounded(response, MAX_METADATA_BYTES)).toString('utf8'),
    ) as unknown;
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('id' in metadata) ||
      metadata.id !== settings.bucket ||
      !('name' in metadata) ||
      metadata.name !== settings.bucket ||
      !('public' in metadata) ||
      metadata.public !== false
    ) {
      throw new Error('Storage bucket must be private');
    }
  }

  protected async readBounded(
    response: Response,
    limit: number,
  ): Promise<Buffer> {
    const size = response.headers.get('content-length');
    if (size !== null && (!/^\d+$/u.test(size) || Number(size) > limit)) {
      await response.body?.cancel();
      throw new Error('Storage response exceeds limit');
    }
    if (!response.body) throw new Error('Storage response is empty');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) throw new Error('Storage response exceeds limit');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, bytes);
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* Abort/transport failures are sanitized by withStorage. */
      }
      reader.releaseLock();
    }
  }

  protected async withStorage<T>(
    operation: (
      settings: StorageConfiguration,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    const settings = this.settings();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(this.unavailable());
      }, PRIVATE_STORAGE_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        operation(settings, controller.signal),
        deadline,
      ]);
    } catch {
      throw this.unavailable();
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  protected unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(this.failureMessage);
  }
}
