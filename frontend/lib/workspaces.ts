export interface WorkspaceListItem {
  id: string;
  name: string;
  description: string | null;
  context: string | null;
  icon: string | null;
  accent_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInput {
  name?: unknown;
  description?: unknown;
  context?: unknown;
  icon?: unknown;
  accent_color?: unknown;
}

export function sanitizeWorkspaceName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function sanitizeWorkspaceDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  return trimmed || null;
}

export function sanitizeWorkspaceContext(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 12000);
  return trimmed || null;
}

export function sanitizeWorkspaceIcon(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 32);
  return trimmed || null;
}

export function sanitizeWorkspaceAccentColor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : null;
}

export function mapWorkspaceRow(row: WorkspaceListItem): WorkspaceListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    context: row.context,
    icon: row.icon,
    accent_color: row.accent_color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
