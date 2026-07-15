import { SetMetadata } from '@nestjs/common';
import {
  MESSAGE_ADMIN_ROLE,
  ROLES_KEY,
  SOURCE_WRITER_ROLE,
} from './auth.constants';

/** Accepts Nest role strings (including `as const` role tokens). */
export function Roles(...roles: string[]) {
  return SetMetadata(ROLES_KEY, roles);
}

/** Class-level access for messaging controllers (admin + source writer). */
export const MessagingAccess = SetMetadata(ROLES_KEY, [
  MESSAGE_ADMIN_ROLE,
  SOURCE_WRITER_ROLE,
]);

/** Method-level restriction to message admins. */
export const MessageAdminOnly = SetMetadata(ROLES_KEY, [MESSAGE_ADMIN_ROLE]);
