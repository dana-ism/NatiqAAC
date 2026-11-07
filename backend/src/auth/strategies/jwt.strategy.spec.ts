import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';
const id = '6fbbe1de-542e-409e-bbec-088c6c084416';
const claims = () => ({
  sub: id,
  email: 'parent@example.com',
  role: 'PARENT',
  exp: Math.floor(Date.now() / 1000) + 900,
});
describe('JwtStrategy runtime claims and current database authority', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  let strategy: JwtStrategy;
  beforeEach(() => {
    jest.resetAllMocks();
    strategy = new JwtStrategy(
      new ConfigService({ JWT_SECRET: 'synthetic-test-secret' }),
      prisma as unknown as PrismaService,
    );
  });
  it.each([
    null,
    'token',
    {},
    { ...claims(), sub: undefined },
    { ...claims(), sub: 'invalid' },
    { ...claims(), exp: undefined },
    { ...claims(), exp: 'tomorrow' },
    { ...claims(), exp: NaN },
    { ...claims(), exp: 1 },
    { ...claims(), email: 5 },
    { ...claims(), role: { toString: {} } },
  ])('rejects invalid claims before Prisma', async (payload) => {
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it.each([null, { status: 'PENDING' }, { status: 'SUSPENDED' }])(
    'rejects absent or inactive users',
    async (user) => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(strategy.validate(claims())).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );
  it('uses current database role and email instead of stale token claims', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id,
      email: 'updated@example.com',
      role: 'SPECIALIST',
      status: 'ACTIVE',
    });
    await expect(strategy.validate(claims())).resolves.toEqual({
      userId: id,
      email: 'updated@example.com',
      role: 'SPECIALIST',
    });
  });
});
