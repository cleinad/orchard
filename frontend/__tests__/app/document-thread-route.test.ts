import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockGenerateText } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@/lib/document-threads/documentThreadModel", () => ({
  DOCUMENT_THREAD_PROVIDER: "anthropic",
  DOCUMENT_THREAD_MODEL_ID: "claude-sonnet-5",
  DOCUMENT_THREAD_MODEL_LABEL: "Claude Sonnet 5",
  DOCUMENT_THREAD_API_KEY_ENV: "ANTHROPIC_API_KEY",
  isDocumentThreadModelConfigured: () => true,
  getDocumentThreadModel: () => ({ modelId: "claude-sonnet-5" }),
  getDocumentThreadUnavailableMessage: () => "Not configured.",
}));

import { MAX_CROP_BYTES, POST } from "@/app/api/document-thread/route";
import { resetPreparedDocuments } from "@/lib/document-threads/preparedDocuments";

const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.7\n1 0 obj\n<< >>\nendobj\ntrailer\n%%EOF\n"
);
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);

async function digestOf(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function pdfFile(bytes: Uint8Array = PDF_BYTES) {
  return new File([bytes as BlobPart], "paper.pdf", { type: "application/pdf" });
}

function cropFile(bytes: Uint8Array = PNG_BYTES) {
  return new File([bytes as BlobPart], "region.png", { type: "image/png" });
}

async function buildForm(
  overrides: Record<string, FormDataEntryValue | null> = {}
) {
  const form = new FormData();
  form.set("documentId", await digestOf(PDF_BYTES));
  form.set("documentName", "paper.pdf");
  form.set("pageIndex", "3");
  form.set("question", "What does this figure show?");
  form.set("crop", cropFile());
  form.set("pdf", pdfFile());

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) form.delete(key);
    else form.set(key, value);
  }
  return form;
}

function request(form: FormData) {
  return new Request("http://localhost/api/document-thread", {
    method: "POST",
    body: form,
  }) as never;
}

describe("POST /api/document-thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreparedDocuments();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockGenerateText.mockResolvedValue({ text: "A grounded answer." });
  });

  it("requires authentication", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("No session"),
    });

    const response = await POST(request(await buildForm()));

    expect(response.status).toBe(401);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("requires a SHA-256 document digest", async () => {
    const response = await POST(
      request(await buildForm({ documentId: "not-a-digest" }))
    );

    expect(response.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("requires a question and a valid page index", async () => {
    expect(
      (await POST(request(await buildForm({ question: null })))).status
    ).toBe(400);
    expect(
      (await POST(request(await buildForm({ pageIndex: "-1" })))).status
    ).toBe(400);
    expect(
      (await POST(request(await buildForm({ pageIndex: "" })))).status
    ).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rejects a crop that is not a PNG", async () => {
    const response = await POST(
      request(
        await buildForm({
          crop: new File([new Uint8Array([1, 2, 3, 4]) as BlobPart], "region.png", {
            type: "image/png",
          }),
        })
      )
    );

    expect(response.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rejects an oversized crop before generating", async () => {
    const oversized = new Uint8Array(MAX_CROP_BYTES + 1);
    oversized.set(PNG_BYTES);
    const response = await POST(
      request(await buildForm({ crop: cropFile(oversized) }))
    );

    expect(response.status).toBe(413);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rejects a PDF that does not match the supplied digest", async () => {
    const response = await POST(
      request(
        await buildForm({
          pdf: pdfFile(new TextEncoder().encode("%PDF-1.7 different bytes")),
        })
      )
    );

    expect(response.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rejects a file that is not a PDF", async () => {
    const bytes = new TextEncoder().encode("not a pdf at all");
    const response = await POST(
      request(
        await buildForm({
          documentId: await digestOf(bytes),
          pdf: pdfFile(bytes),
        })
      )
    );

    expect(response.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("asks the browser to re-prepare when no record backs the token", async () => {
    const response = await POST(
      request(
        await buildForm({ pdf: null, documentToken: "11111111-2222-3333-4444" })
      )
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ needsDocument: true });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("prepares the document and grounds the answer in the PDF and crop", async () => {
    const response = await POST(request(await buildForm()));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toBe("A grounded answer.");
    expect(body.model).toMatchObject({
      id: "claude-sonnet-5",
      provider: "anthropic",
    });
    expect(typeof body.document.token).toBe("string");
    expect(body.document.expiresAt).toBeGreaterThan(Date.now());

    const call = mockGenerateText.mock.calls[0][0];
    // App-owned instructions stay separate from and authoritative over content.
    expect(call.system).toMatch(/untrusted data/i);
    expect(call.system).not.toContain("What does this figure show?");

    const [content] = call.messages;
    expect(content.role).toBe("user");
    expect(content.content[0]).toMatchObject({
      type: "file",
      mediaType: "application/pdf",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
    expect(content.content[2]).toMatchObject({
      type: "file",
      mediaType: "image/png",
    });
    expect(content.content[3].text).toContain("What does this figure show?");
    expect(content.content[3].text).toContain("page 4");
  });

  it("reuses a prepared document without resending the PDF", async () => {
    const first = await POST(request(await buildForm()));
    const { document } = await first.json();

    const second = await POST(
      request(await buildForm({ pdf: null, documentToken: document.token }))
    );

    expect(second.status).toBe(200);
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
    const reusedBody = await second.json();
    expect(reusedBody.document.token).toBe(document.token);
  });

  it("refuses another user's prepared token", async () => {
    const first = await POST(request(await buildForm()));
    const { document } = await first.json();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    const response = await POST(
      request(await buildForm({ pdf: null, documentToken: document.token }))
    );

    expect(response.status).toBe(409);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-multipart body", async () => {
    const response = await POST(
      new Request("http://localhost/api/document-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Why?" }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
