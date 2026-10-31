import type { Role } from "@tdc/db";

export type Permission =
  | "dashboard:view"
  | "articles:edit"
  | "articles:review"
  | "articles:publish"
  | "candidates:view"
  | "sources:manage"
  | "taxonomy:manage"
  | "jobs:view"
  | "jobs:trigger"
  | "usage:view"
  | "settings:manage"
  | "users:manage"
  | "subscribers:view"
  | "messages:view";

const VIEWER: Permission[] = ["dashboard:view", "candidates:view", "jobs:view"];
const EDITOR: Permission[] = [
  ...VIEWER,
  "articles:edit",
  "articles:review",
  "articles:publish",
  "sources:manage",
  "taxonomy:manage",
  "jobs:trigger",
  "usage:view",
  "messages:view",
];
const ADMIN: Permission[] = [...EDITOR, "settings:manage", "users:manage", "subscribers:view"];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  VIEWER: new Set(VIEWER),
  EDITOR: new Set(EDITOR),
  ADMIN: new Set(ADMIN),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
