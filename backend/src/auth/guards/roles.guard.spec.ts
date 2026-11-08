import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard fails closed', () => {
  const metadata = jest.fn();
  const reflector = { getAllAndOverride: metadata } as unknown as Reflector;
  const context = (user?: { role: string }) =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  it('requires role metadata and an authenticated database identity', () => {
    const guard = new RolesGuard(reflector);
    metadata.mockReturnValue(undefined);
    expect(guard.canActivate(context({ role: 'ADMIN' }))).toBe(false);
    metadata.mockReturnValue(['ADMIN']);
    expect(guard.canActivate(context())).toBe(false);
    expect(guard.canActivate(context({ role: 'PARENT' }))).toBe(false);
    expect(guard.canActivate(context({ role: 'ADMIN' }))).toBe(true);
  });
});
