import { ROLE_PERMISSIONS, type Permission, type StaffRoleName } from "./permissions";

export * from "./permissions";

/**
 * Effective permissions for a staff member.
 *
 * Resolution order, strictest wins:
 *   1. SUPER_ADMIN → everything.
 *   2. An explicit DENY grant → denied, regardless of role.
 *   3. An explicit ALLOW grant (not expired) → allowed.
 *   4. The role default.
 *
 * Deny-beats-allow is the important property: revoking a capability from one
 * person must not require inventing a new role for them.
 */

export interface PermissionGrantLike {
  permission: string;
  allow: boolean;
  expiresAt?: Date | null;
}

export interface Principal {
  role: StaffRoleName;
  grants?: PermissionGrantLike[];
}

function activeGrants(grants: PermissionGrantLike[] | undefined, now: Date): PermissionGrantLike[] {
  if (!grants) return [];
  return grants.filter((g) => !g.expiresAt || g.expiresAt.getTime() > now.getTime());
}

export function can(principal: Principal, permission: Permission, now: Date = new Date()): boolean {
  if (principal.role === "SUPER_ADMIN") return true;

  const grants = activeGrants(principal.grants, now);

  const denied = grants.some((g) => g.permission === permission && !g.allow);
  if (denied) return false;

  const allowed = grants.some((g) => g.permission === permission && g.allow);
  if (allowed) return true;

  return (ROLE_PERMISSIONS[principal.role] ?? []).includes(permission);
}

export function canAll(principal: Principal, permissions: Permission[], now?: Date): boolean {
  return permissions.every((p) => can(principal, p, now));
}

export function canAny(principal: Principal, permissions: Permission[], now?: Date): boolean {
  return permissions.some((p) => can(principal, p, now));
}

/** Full effective set, for rendering the admin navigation and the audit UI. */
export function effectivePermissions(principal: Principal, now: Date = new Date()): Permission[] {
  if (principal.role === "SUPER_ADMIN") return [...ROLE_PERMISSIONS.SUPER_ADMIN];

  const grants = activeGrants(principal.grants, now);
  const base = new Set<Permission>(ROLE_PERMISSIONS[principal.role] ?? []);

  for (const grant of grants) {
    const permission = grant.permission as Permission;
    if (grant.allow) base.add(permission);
    else base.delete(permission);
  }

  return [...base];
}

/** Thrown by `requirePermission`; mapped to a 403 by the API error handler. */
export class ForbiddenError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export function requirePermission(principal: Principal, permission: Permission, now?: Date): void {
  if (!can(principal, permission, now)) throw new ForbiddenError(permission);
}
