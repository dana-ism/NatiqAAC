import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { isUUID } from 'class-validator';
import {
  PrivateBucketStorage,
  PRIVATE_STORAGE_TIMEOUT_MS,
} from '../files/private-bucket-storage';

export const MAX_SPECIALIST_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_STORAGE_TIMEOUT_MS = PRIVATE_STORAGE_TIMEOUT_MS;
const compress = promisify(gzip);
const decompress = promisify(gunzip);

/**
 * Private infrastructure only. The application must authorize the current user
 * and load the object key from its own database before calling download().
 * PDF signature/EOF checks are not a parser, sanitizer or malware scan. Serve
 * downloads as attachments with nosniff, never as trusted inline HTML/content.
 * No deletion is performed: retention and orphan reconciliation need owner policy.
 */
@Injectable()
export class DocumentStorageService extends PrivateBucketStorage {
  constructor(config: ConfigService) {
    super(
      config,
      'SPECIALIST_DOCUMENT_BUCKET',
      'Private document storage is temporarily unavailable',
    );
  }

  async upload(
    data: Buffer,
    userId: string,
  ): Promise<{ key: string; sha256: string; size: number }> {
    if (!this.isCanonicalUuid(userId)) {
      throw new BadRequestException('Invalid document owner');
    }
    if (
      !Buffer.isBuffer(data) ||
      data.length > MAX_SPECIALIST_DOCUMENT_BYTES ||
      !this.isPdf(data)
    ) {
      throw new BadRequestException(
        'Supporting document must be a PDF of at most 5 MiB',
      );
    }
    // Snapshot validated bytes before the first asynchronous boundary.
    const snapshot = Buffer.from(data);
    const sha256 = createHash('sha256').update(snapshot).digest('hex');
    return this.withStorage(async (settings, signal) => {
      await this.assertPrivateBucket(settings, signal);
      const compressed = await compress(snapshot, { level: 9 });
      // Already-compressed PDFs can grow with gzip. Store only the smaller form.
      const useCompression = compressed.length < snapshot.length;
      const body = new Uint8Array(useCompression ? compressed : snapshot);
      const key = `${userId}/${randomUUID()}.pdf${useCompression ? '.gz' : ''}`;
      signal.throwIfAborted();
      const response = await fetch(
        `${settings.origin}/storage/v1/object/${settings.bucket}/${key}`,
        {
          method: 'POST',
          headers: {
            ...this.headers(settings),
            'Content-Type': useCompression
              ? 'application/gzip'
              : 'application/pdf',
            'x-upsert': 'false',
            'Cache-Control': 'no-store',
          },
          body,
          redirect: 'error',
          signal,
        },
      );
      if (!response.ok) throw new Error('Storage upload failed');
      // The generated key is authoritative, never a provider-returned URL/path.
      await response.body?.cancel();
      // Preserve database metadata semantics: original PDF size and digest.
      return { key, sha256, size: snapshot.length };
    });
  }

  async download(key: string): Promise<Buffer> {
    if (!this.isDocumentKey(key)) {
      throw new BadRequestException('Invalid document reference');
    }
    return this.withStorage(async (settings, signal) => {
      await this.assertPrivateBucket(settings, signal);
      const response = await fetch(
        `${settings.origin}/storage/v1/object/authenticated/${settings.bucket}/${key}`,
        {
          method: 'GET',
          headers: this.headers(settings),
          redirect: 'error',
          signal,
        },
      );
      if (!response.ok) throw new Error('Storage download failed');
      const stored = await this.readBounded(
        response,
        MAX_SPECIALIST_DOCUMENT_BYTES,
      );
      const data = key.endsWith('.pdf.gz')
        ? await decompress(stored, {
            maxOutputLength: MAX_SPECIALIST_DOCUMENT_BYTES,
          })
        : stored;
      signal.throwIfAborted();
      if (!this.isPdf(data)) throw new Error('Stored document is not a PDF');
      return data;
    });
  }

  private isCanonicalUuid(value: string): boolean {
    return (
      typeof value === 'string' &&
      value === value.toLowerCase() &&
      isUUID(value)
    );
  }

  private isDocumentKey(value: string): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.split('/');
    const filename = (parts[1] ?? '').replace(/\.gz$/u, '');
    return (
      parts.length === 2 &&
      this.isCanonicalUuid(parts[0]) &&
      filename.endsWith('.pdf') &&
      isUUID(filename.slice(0, -4), '4') &&
      parts[1] === parts[1].toLowerCase()
    );
  }

  private isPdf(data: Buffer): boolean {
    if (!data.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii')))
      return false;
    // EOF must occur near the end; only PDF whitespace may follow it.
    const tail = data.subarray(Math.max(0, data.length - 1024));
    const eof = tail.lastIndexOf('%%EOF');
    return (
      eof >= 0 &&
      tail
        .subarray(eof + 5)
        .every((byte) => [0, 9, 10, 12, 13, 32].includes(byte))
    );
  }
}
