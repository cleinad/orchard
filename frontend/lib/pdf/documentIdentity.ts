export async function createPdfDocumentId(bytes: Uint8Array) {
  const digestInput = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

