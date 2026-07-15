import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SOURCE_WRITER_ROLE } from './auth.constants';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  beforeEach(() => {
    getAllAndOverride.mockReset();
    getAllAndOverride.mockReturnValue([SOURCE_WRITER_ROLE]);
  });

  it('allows users with the required role', () => {
    expect(guard.canActivate(contextWithRoles([SOURCE_WRITER_ROLE]))).toBe(
      true,
    );
  });

  it('rejects users without the required role', () => {
    expect(guard.canActivate(contextWithRoles(['reader']))).toBe(false);
  });

  it('allows requests when no roles are required', () => {
    getAllAndOverride.mockReturnValueOnce(undefined);
    expect(guard.canActivate(contextWithRoles([]))).toBe(true);
    getAllAndOverride.mockReturnValueOnce([]);
    expect(guard.canActivate(contextWithRoles([]))).toBe(true);
  });

  function contextWithRoles(roles: string[]): ExecutionContext {
    return {
      getClass: jest.fn(),
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as unknown as ExecutionContext;
  }
});
