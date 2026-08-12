import { beforeEach, describe, expect, it } from "vitest";
import {
  PREPARED_DOCUMENT_MAX_ENTRIES,
  PREPARED_DOCUMENT_TTL_MS,
  forgetPreparedDocument,
  prepareDocument,
  resetPreparedDocuments,
  resolvePreparedDocument,
} from "@/lib/document-threads/preparedDocuments";

const BASE_KEY = {
  userId: "user-1",
  documentId: "a".repeat(64),
  provider: "anthropic",
  modelId: "claude-sonnet-5",
};

function prepare(overrides: Partial<typeof BASE_KEY> = {}, now = 1_000) {
  return prepareDocument(
    { ...BASE_KEY, ...overrides },
    { documentName: "paper.pdf", bytes: new Uint8Array([1, 2, 3]) },
    now
  );
}

describe("prepared document records", () => {
  beforeEach(() => {
    resetPreparedDocuments();
  });

  it("resolves a token only for the exact user, document, provider, and model", () => {
    const record = prepare();

    expect(resolvePreparedDocument(record.token, BASE_KEY, 2_000)).not.toBeNull();
    expect(
      resolvePreparedDocument(record.token, { ...BASE_KEY, userId: "user-2" }, 2_000)
    ).toBeNull();
    expect(
      resolvePreparedDocument(
        record.token,
        { ...BASE_KEY, documentId: "b".repeat(64) },
        2_000
      )
    ).toBeNull();
    expect(
      resolvePreparedDocument(record.token, { ...BASE_KEY, modelId: "other" }, 2_000)
    ).toBeNull();
    expect(
      resolvePreparedDocument(
        record.token,
        { ...BASE_KEY, provider: "google" },
        2_000
      )
    ).toBeNull();
  });

  it("rejects an unknown token", () => {
    expect(resolvePreparedDocument("not-a-token", BASE_KEY, 2_000)).toBeNull();
  });

  it("expires a record and forces re-preparation", () => {
    const record = prepare({}, 1_000);
    const afterExpiry = 1_000 + PREPARED_DOCUMENT_TTL_MS + 1;

    expect(resolvePreparedDocument(record.token, BASE_KEY, afterExpiry)).toBeNull();
    expect(resolvePreparedDocument(record.token, BASE_KEY, afterExpiry)).toBeNull();
  });

  it("slides expiry forward while the session stays active", () => {
    const record = prepare({}, 1_000);
    const midway = 1_000 + PREPARED_DOCUMENT_TTL_MS - 1;

    const resolved = resolvePreparedDocument(record.token, BASE_KEY, midway);
    expect(resolved?.expiresAt).toBe(midway + PREPARED_DOCUMENT_TTL_MS);
    expect(
      resolvePreparedDocument(record.token, BASE_KEY, midway + 1_000)
    ).not.toBeNull();
  });

  it("replaces an earlier record for the same identity", () => {
    const first = prepare({}, 1_000);
    const second = prepare({}, 1_500);

    expect(second.token).not.toBe(first.token);
    expect(resolvePreparedDocument(first.token, BASE_KEY, 2_000)).toBeNull();
    expect(resolvePreparedDocument(second.token, BASE_KEY, 2_000)).not.toBeNull();
  });

  it("evicts the oldest records past the entry budget", () => {
    const records = Array.from(
      { length: PREPARED_DOCUMENT_MAX_ENTRIES + 2 },
      (_unused, index) =>
        prepare({ documentId: String(index).padStart(64, "0") }, 1_000 + index)
    );
    const now = 2_000;

    expect(
      resolvePreparedDocument(
        records[0].token,
        { ...BASE_KEY, documentId: records[0].documentId },
        now
      )
    ).toBeNull();
    const newest = records.at(-1)!;
    expect(
      resolvePreparedDocument(
        newest.token,
        { ...BASE_KEY, documentId: newest.documentId },
        now
      )
    ).not.toBeNull();
  });

  it("forgets a record on demand", () => {
    const record = prepare();
    expect(forgetPreparedDocument(record.token)).toBe(true);
    expect(resolvePreparedDocument(record.token, BASE_KEY, 2_000)).toBeNull();
  });
});
