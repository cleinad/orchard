/**
 * Expiring, in-memory record of a PDF that has been accepted for one
 * user/document/provider/model combination.
 *
 * This is an optimization and an authorization boundary, not product storage:
 * nothing is written to the database, object storage, or disk, and every record
 * is lost on process restart. Callers must be able to re-prepare at any time.
 *
 * The provider reference is a server-issued opaque token rather than a provider
 * file id. Anthropic's Files API has no TTL, requires explicit deletion, and is
 * workspace-scoped rather than user-scoped, so it is the wrong primitive for a
 * session-only spike. Reuse across questions is achieved instead through the
 * provider's ephemeral prompt cache.
 */

export interface PreparedDocumentKey {
  userId: string;
  documentId: string;
  provider: string;
  modelId: string;
}

export interface PreparedDocumentRecord extends PreparedDocumentKey {
  token: string;
  documentName: string;
  bytes: Uint8Array;
  expiresAt: number;
}

export const PREPARED_DOCUMENT_TTL_MS = 20 * 60 * 1000;
export const PREPARED_DOCUMENT_MAX_ENTRIES = 8;
export const PREPARED_DOCUMENT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

const records = new Map<string, PreparedDocumentRecord>();

function identityOf(key: PreparedDocumentKey) {
  return [key.userId, key.documentId, key.provider, key.modelId].join("\u0000");
}

function sweep(now: number) {
  for (const [token, record] of records) {
    if (record.expiresAt <= now) records.delete(token);
  }
}

function totalBytes() {
  let total = 0;
  for (const record of records.values()) total += record.bytes.byteLength;
  return total;
}

/** Evicts the oldest records until the entry and byte budgets are respected. */
function enforceBudgets() {
  while (
    records.size > PREPARED_DOCUMENT_MAX_ENTRIES
    || totalBytes() > PREPARED_DOCUMENT_MAX_TOTAL_BYTES
  ) {
    const oldest = records.keys().next();
    if (oldest.done) break;
    records.delete(oldest.value);
  }
}

export function prepareDocument(
  key: PreparedDocumentKey,
  input: { documentName: string; bytes: Uint8Array },
  now = Date.now()
): PreparedDocumentRecord {
  sweep(now);

  const identity = identityOf(key);
  for (const [token, record] of records) {
    if (identityOf(record) === identity) records.delete(token);
  }

  const record: PreparedDocumentRecord = {
    ...key,
    token: crypto.randomUUID(),
    documentName: input.documentName,
    bytes: input.bytes,
    expiresAt: now + PREPARED_DOCUMENT_TTL_MS,
  };
  records.set(record.token, record);
  enforceBudgets();
  return record;
}

/**
 * Resolves a token to its record only when every identity field matches the
 * caller. A token alone never grants access to another user's document.
 */
export function resolvePreparedDocument(
  token: string,
  key: PreparedDocumentKey,
  now = Date.now()
): PreparedDocumentRecord | null {
  sweep(now);

  const record = records.get(token);
  if (!record) return null;
  if (identityOf(record) !== identityOf(key)) return null;
  if (record.expiresAt <= now) {
    records.delete(token);
    return null;
  }

  // Sliding expiry: an active reading session keeps its record warm.
  record.expiresAt = now + PREPARED_DOCUMENT_TTL_MS;
  records.delete(token);
  records.set(token, record);
  return record;
}

export function forgetPreparedDocument(token: string) {
  return records.delete(token);
}

/** Test-only helper. */
export function resetPreparedDocuments() {
  records.clear();
}
