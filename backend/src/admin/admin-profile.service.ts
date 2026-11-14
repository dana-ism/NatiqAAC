import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorageService } from './avatar-storage.service';

const profileSelection = {
  fullName: true,
  avatarKey: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  emailVerifiedAt: true,
  passwordHash: true,
  identities: { select: { provider: true } },
} as const;

@Injectable()
export class AdminProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarStorageService,
  ) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelection,
    });
    if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Account is not active');
    return {
      fullName: user.fullName,
      hasAvatar: !!user.avatarKey,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      emailVerified: user.emailVerifiedAt !== null,
      passwordEnabled: user.passwordHash !== null,
      connectedProviders: user.identities.map((identity) => identity.provider),
    };
  }

  async rename(userId: string, fullName: string, expectedUpdatedAt: string) {
    const result = await this.prisma.user.updateMany({
      where: {
        id: userId,
        role: 'ADMIN',
        status: 'ACTIVE',
        updatedAt: new Date(expectedUpdatedAt),
      },
      data: {
        fullName,
        updatedAt: new Date(
          Math.max(Date.now(), new Date(expectedUpdatedAt).getTime() + 1),
        ),
      },
    });
    if (result.count !== 1) {
      // Distinguish a revoked account from an ordinary optimistic-write conflict.
      await this.get(userId);
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'PROFILE_CHANGED',
        message: 'Profile changed. Reload before saving again',
      });
    }
    return this.get(userId);
  }
  private async owner(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true, avatarKey: true, updatedAt: true },
    });
    if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Account is not active');
    return user;
  }
  async image(userId: string) {
    const user = await this.owner(userId);
    if (!user.avatarKey) throw new NotFoundException('No profile photo');
    return this.avatars.download(user.avatarKey, userId);
  }
  async changeAvatar(
    userId: string,
    expectedUpdatedAt: string,
    file?: { buffer: Buffer; mimetype: string },
  ) {
    const owner = await this.owner(userId);
    if (owner.updatedAt.toISOString() !== expectedUpdatedAt)
      throw new ConflictException(
        'Profile changed. Reload before saving again',
      );
    const key = file
      ? await this.avatars.upload(file.buffer, file.mimetype, userId)
      : null;
    let committed = false;
    try {
      const changed = await this.prisma.user.updateMany({
        where: {
          id: userId,
          role: 'ADMIN',
          status: 'ACTIVE',
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: {
          avatarKey: key,
          updatedAt: new Date(
            Math.max(Date.now(), owner.updatedAt.getTime() + 1),
          ),
        },
      });
      if (changed.count !== 1) {
        await this.owner(userId);
        throw new ConflictException(
          'Profile changed. Reload before saving again',
        );
      }
      committed = true;
    } finally {
      if (!committed && key) await this.avatars.cleanup(key, userId);
    }
    if (owner.avatarKey) await this.avatars.cleanup(owner.avatarKey, userId);
    return this.get(userId);
  }
}
