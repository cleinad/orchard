import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase-server';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const adminAuthorizationBrand = Symbol('adminAuthorization');

export interface AdminAuthorization {
  readonly userId: string;
  readonly [adminAuthorizationBrand]: true;
}

export function parseAdminUserIds(value: string | undefined): ReadonlySet<string> | null {
  if (!value?.trim()) return null;

  const ids = value.split(',').map((candidate) => candidate.trim().toLowerCase());
  if (ids.some((candidate) => !UUID_PATTERN.test(candidate))) return null;

  return new Set(ids);
}

export async function authorizeAdminUser(): Promise<AdminAuthorization | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !UUID_PATTERN.test(user.id)) return null;

  const adminUserIds = parseAdminUserIds(process.env.ORCHARD_ADMIN_USER_IDS);
  const normalizedUserId = user.id.toLowerCase();
  if (!adminUserIds?.has(normalizedUserId)) return null;

  return {
    userId: normalizedUserId,
    [adminAuthorizationBrand]: true,
  };
}

export function isAdminAuthorization(value: unknown): value is AdminAuthorization {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as Record<PropertyKey, unknown>)[adminAuthorizationBrand] === true
  );
}
