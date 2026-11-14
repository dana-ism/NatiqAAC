import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrivateBucketStorage } from '../files/private-bucket-storage';

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 4096 * 4096;
const invalid = () =>
  new BadRequestException(
    'Use a valid JPEG, PNG or WebP image of at most 2 MiB and 4096 pixels per side',
  );
const formats = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

@Injectable()
export class AvatarStorageService extends PrivateBucketStorage {
  private readonly logger = new Logger(AvatarStorageService.name);
  constructor(config: ConfigService) {
    super(
      config,
      'ADMIN_AVATAR_BUCKET',
      'Private avatar storage is temporarily unavailable',
      'admin-profile-avatars',
      'SPECIALIST_DOCUMENT_BUCKET',
    );
  }
  private validKey(key: string, owner: string) {
    const pieces = key.split('/');
    return (
      owner === owner.toLowerCase() &&
      isUUID(owner) &&
      pieces.length === 2 &&
      pieces[0] === owner &&
      pieces[1].endsWith('.webp') &&
      isUUID(pieces[1].slice(0, -5), '4') &&
      key === key.toLowerCase()
    );
  }
  private signature(data: Buffer) {
    if (
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return 'png';
    if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'jpeg';
    if (
      data.length >= 12 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP'
    )
      return 'webp';
    return null;
  }
  async normalize(data: Buffer, mime: string): Promise<Buffer> {
    if (
      !Buffer.isBuffer(data) ||
      !data.length ||
      data.length > MAX_AVATAR_BYTES
    )
      throw invalid();
    const snapshot = Buffer.from(data);
    const kind = this.signature(snapshot);
    if (!kind || formats[kind] !== mime) throw invalid();
    // libvips can read an APNG as a static PNG. Reject its animation control
    // chunk explicitly, and reject WebP animation chunks before decoding.
    if (kind === 'png' || kind === 'webp') {
      let offset = kind === 'png' ? 8 : 12;
      while (offset + (kind === 'png' ? 12 : 8) <= snapshot.length) {
        const size =
          kind === 'png'
            ? snapshot.readUInt32BE(offset)
            : snapshot.readUInt32LE(offset + 4);
        const type = snapshot.toString(
          'ascii',
          offset + (kind === 'png' ? 4 : 0),
          offset + (kind === 'png' ? 8 : 4),
        );
        if (['acTL', 'ANIM', 'ANMF'].includes(type)) throw invalid();
        offset += kind === 'png' ? size + 12 : size + 8 + (size % 2);
      }
    }
    try {
      const image = sharp(snapshot, {
        limitInputPixels: MAX_PIXELS,
        failOn: 'warning',
        animated: false,
      });
      const metadata = await image.metadata();
      if (
        metadata.format !== kind ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 4096 ||
        metadata.height > 4096 ||
        (metadata.pages ?? 1) !== 1
      )
        throw invalid();
      // Decode/re-encode pixels; Sharp drops EXIF/XMP/ICC and other input metadata.
      const bytes = await image
        .rotate()
        .resize({
          width: 512,
          height: 512,
          fit: 'cover',
          withoutEnlargement: true,
        })
        .webp({ quality: 85, effort: 4 })
        .timeout({ seconds: 3 })
        .toBuffer();
      if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw invalid();
      return bytes;
    } catch {
      throw invalid();
    }
  }
  async upload(data: Buffer, mime: string, owner: string): Promise<string> {
    if (owner !== owner.toLowerCase() || !isUUID(owner)) throw invalid();
    const bytes = await this.normalize(data, mime);
    const key = `${owner}/${randomUUID()}.webp`;
    let attempted = false;
    try {
      await this.withStorage(async (settings, signal) => {
        await this.assertPrivateBucket(settings, signal);
        attempted = true;
        const response = await fetch(
          `${settings.origin}/storage/v1/object/${settings.bucket}/${key}`,
          {
            method: 'POST',
            headers: {
              ...this.headers(settings),
              'Content-Type': 'image/webp',
              'x-upsert': 'false',
              'Cache-Control': 'no-store',
            },
            body: new Uint8Array(bytes),
            redirect: 'error',
            signal,
          },
        );
        if (!response.ok) {
          // A definite client/conflict response did not create this object.
          // In particular, never delete an existing object after HTTP 409.
          if (response.status < 500) attempted = false;
          throw new Error('Upload unavailable');
        }
        await response.body?.cancel();
      });
      return key;
    } catch (error) {
      if (attempted) await this.cleanup(key, owner);
      throw error;
    }
  }
  async download(key: string, owner: string): Promise<Buffer> {
    if (!this.validKey(key, owner))
      throw new BadRequestException('Invalid own-avatar reference');
    return this.withStorage(async (settings, signal) => {
      await this.assertPrivateBucket(settings, signal);
      const response = await fetch(
        `${settings.origin}/storage/v1/object/authenticated/${settings.bucket}/${key}`,
        { headers: this.headers(settings), redirect: 'error', signal },
      );
      if (!response.ok) throw new Error('Download unavailable');
      const bytes = await this.readBounded(response, MAX_AVATAR_BYTES);
      if (this.signature(bytes) !== 'webp')
        throw new Error('Invalid stored image');
      const decoded = sharp(bytes, {
        limitInputPixels: 512 * 512,
        failOn: 'warning',
      });
      const info = await decoded.metadata();
      if (
        info.format !== 'webp' ||
        !info.width ||
        !info.height ||
        info.width > 512 ||
        info.height > 512 ||
        (info.pages ?? 1) !== 1 ||
        info.exif ||
        info.xmp ||
        info.icc
      )
        throw new Error('Stored image is not canonical');
      await decoded.raw().timeout({ seconds: 3 }).toBuffer();
      return bytes;
    });
  }
  async remove(key: string, owner: string) {
    if (!this.validKey(key, owner))
      throw new BadRequestException('Invalid own-avatar reference');
    return this.withStorage(async (settings, signal) => {
      await this.assertPrivateBucket(settings, signal);
      const response = await fetch(
        `${settings.origin}/storage/v1/object/${settings.bucket}`,
        {
          method: 'DELETE',
          headers: {
            ...this.headers(settings),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefixes: [key] }),
          redirect: 'error',
          signal,
        },
      );
      if (!response.ok) throw new Error('Removal unavailable');
      await response.body?.cancel();
    });
  }
  async cleanup(key: string, owner: string) {
    try {
      await this.remove(key, owner);
    } catch {
      this.logger.warn(
        'Avatar cleanup deferred: private storage unavailable or reference invalid. Reconciliation is required.',
      );
    }
  }
}
