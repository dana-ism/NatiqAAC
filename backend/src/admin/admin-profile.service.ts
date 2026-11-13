import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const profileSelection = {
  fullName: true,
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
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelection,
    });
    if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Account is not active');
    return {
      fullName: user.fullName,
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
}
