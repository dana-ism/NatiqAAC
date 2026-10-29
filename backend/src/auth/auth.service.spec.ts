
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, compare } from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      fullName: 'Test Parent',
      email: 'parent@example.com',
      password: 'TestPass123!',
    };

    it('should register a parent and not return the password hash', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      (hash as jest.Mock).mockResolvedValue('hashed-password');

      prismaMock.user.create.mockResolvedValue({
        id: 'user-1',
        fullName: registerDto.fullName,
        email: registerDto.email,
        role: 'PARENT',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const result = await service.register(registerDto);

      expect(hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: registerDto.email,
            passwordHash: 'hashed-password',
            role: 'PARENT',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should reject a password exceeding 72 bytes', async () => {
      const longPassword = 'a'.repeat(73);

      await expect(
        service.register({
          ...registerDto,
          password: longPassword,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(hash).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject registration when the email already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );

      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it('should reject registration when Prisma reports a unique constraint conflict', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      (hash as jest.Mock).mockResolvedValue('hashed-password');

      prismaMock.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed',
          {
            code: 'P2002',
            clientVersion: '7.10.1',
            meta: { target: ['email'] },
          },
        ),
      );

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'parent@example.com',
      password: 'TestPass123!',
    };

    const activeUser = {
      id: 'user-1',
      fullName: 'Test Parent',
      email: loginDto.email,
      passwordHash: 'hashed-password',
      role: 'PARENT',
      status: 'ACTIVE',
    };

    it('should reject login when the email does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(compare).not.toHaveBeenCalled();
    });

    it('should reject a password exceeding 72 bytes', async () => {
      const longPassword = 'a'.repeat(73);

      await expect(
        service.login({
          ...loginDto,
          password: longPassword,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(compare).not.toHaveBeenCalled();
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('should reject login when the password is incorrect', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('should reject login for an inactive account', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...activeUser,
        status: 'PENDING',
      });
      (compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(loginDto)).rejects.toThrow(
        ForbiddenException,
      );

      expect(jwtMock.signAsync).not.toHaveBeenCalled();
    });

    it('should return an access token after successful login', async () => {
      prismaMock.user.findUnique.mockResolvedValue(activeUser);
      (compare as jest.Mock).mockResolvedValue(true);
      jwtMock.signAsync.mockResolvedValue('test-access-token');

      const result = await service.login(loginDto);

      expect(jwtMock.signAsync).toHaveBeenCalledWith({
        sub: activeUser.id,
        email: activeUser.email,
        role: activeUser.role,
      });
      expect(result.access_token).toBe('test-access-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });
});
