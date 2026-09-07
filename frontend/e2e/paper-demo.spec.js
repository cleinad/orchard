const path = require("node:path");
const { readFileSync } = require("node:fs");
const { test, expect } = require("@playwright/test");

const fixturesDir = path.join(__dirname, "fixtures", "pdf");

async function mockDocumentThread(page, answer = "A grounded answer.") {
  const requests = [];
  await page.route("**/api/document-thread", async (route) => {
    const request = route.request();
    requests.push({
      contentType: request.headers()["content-type"] ?? "",
      body: request.postData() ?? "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer,
        document: { token: "prepared-token", expiresAt: Date.now() + 600_000 },
        model: { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      }),
    });
  });
  return requests;
}

async function loadFixture(page, fileName) {
  await page.goto("/paper-demo?e2e=1");
  await page.getByTestId("paper-file-input").setInputFiles(
    path.join(fixturesDir, fileName)
  );
}

async function openFixture(page, fileName) {
  await loadFixture(page, fileName);
  await expect(page.locator(".paper-pdf-page-surface").first()).toBeVisible();
}

async function enableHighlightMode(page) {
  const toggle = page.getByTestId("paper-highlight-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("paper-region-capture-0")).toBeVisible();
}

async function drawRegion(
  page,
  { pageIndex = 0, left = 0.15, top = 0.15, width = 0.5, height = 0.2 } = {}
) {
  const surface = page
    .locator(`[data-pdf-page-index="${pageIndex}"] .paper-pdf-page-surface`)
    .first();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width * left;
  const startY = box.y + box.height * top;
  const endX = startX + box.width * width;
  const endY = startY + box.height * height;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 6, startY + 6);
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

/**
 * Reads the page surface and the first region highlight in a single evaluate so
 * the two rectangles always come from the same layout.
 */
function readRegionGeometry(page, testId = "paper-region-highlight") {
  return page.evaluate((id) => {
    const surface = document.querySelector(".paper-pdf-page-surface");
    const highlight = document.querySelector(`[data-testid="${id}"]`);
    if (!surface || !highlight) return null;
    const s = surface.getBoundingClientRect();
    const h = highlight.getBoundingClientRect();
    return {
      surface: { left: s.left, top: s.top, width: s.width, height: s.height },
      highlight: { left: h.left, top: h.top, width: h.width, height: h.height },
      relativeLeft: (h.left - s.left) / s.width,
      relativeTop: (h.top - s.top) / s.height,
    };
  }, testId);
}

/** Waits until the page surface has finished re-rendering at the new zoom. */
async function waitForZoomedSurface(page, previousWidth, zoomRatio) {
  await expect
    .poll(async () => {
      const geometry = await readRegionGeometry(page);
      return geometry
        ? Math.abs(geometry.surface.width - previousWidth * zoomRatio)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(1.5);
}

test("draws a region, asks a question, and reopens the persistent highlight", async ({
  page,
}) => {
  const requests = await mockDocumentThread(
    page,
    "This diagram compares the two decoders."
  );
  await openFixture(page, "anchor-single-column.pdf");
  await enableHighlightMode(page);
  await drawRegion(page);

  // Highlight mode is single-shot.
  await expect(page.getByTestId("paper-highlight-toggle")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.getByTestId("paper-region-active")).toHaveCount(1);

  // The popover previews a crop thumbnail instead of a text quote.
  await expect(page.getByTestId("selection-popover")).toBeVisible();
  const preview = page.getByTestId("selection-popover-preview");
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute("src")).toMatch(/^blob:/);
  await expect(
    page.getByTestId("selection-popover").locator("p")
  ).toHaveCount(0);

  await page.getByTestId("selection-popover-input").fill("What is shown here?");
  await page.getByTestId("selection-popover-input").press("Enter");

  await expect(page.getByTestId("paper-thread-panel")).toBeVisible();
  await expect(page.getByTestId("paper-thread-crop")).toBeVisible();
  await expect(
    page.getByText("This diagram compares the two decoders.")
  ).toBeVisible();

  // The whole PDF is relayed once, as multipart, only on the first question.
  expect(requests).toHaveLength(1);
  expect(requests[0].contentType).toContain("multipart/form-data");
  expect(requests[0].body).toContain('name="pdf"');
  expect(requests[0].body).toContain('name="crop"');
  expect(requests[0].body).toContain('name="documentId"');

  // A persistent, generically labelled border highlight remains on the page.
  const highlight = page.getByTestId("paper-region-highlight");
  await expect(highlight).toHaveCount(1);
  await expect(highlight).toHaveAttribute(
    "aria-label",
    "Highlight 1 on page 1 (ready)"
  );
  await expect(highlight).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Close paper thread" }).click();
  await expect(page.getByTestId("paper-thread-panel")).toHaveCount(0);
  await highlight.click();
  await expect(page.getByTestId("paper-thread-panel")).toContainText(
    "This diagram compares the two decoders."
  );
});

test("uses instant, not smooth, scrolling under reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockDocumentThread(page, "A grounded answer.");
  await openFixture(page, "anchor-single-column.pdf");

  await page.evaluate(() => {
    window.__scrollBehaviors = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      window.__scrollBehaviors.push(
        typeof options === "object" ? (options.behavior ?? "auto") : "auto"
      );
      return original.call(this, options);
    };
  });

  await enableHighlightMode(page);
  await drawRegion(page);
  await page.getByRole("button", { name: "Explain" }).click();
  // The panel scrolls to the new answer as soon as it arrives.
  await expect(page.getByText("A grounded answer.")).toBeVisible();

  await page.getByRole("button", { name: "Show on page" }).click();

  const behaviors = await page.evaluate(() => window.__scrollBehaviors);
  expect(behaviors.length).toBeGreaterThan(0);
  expect(behaviors.every((behavior) => behavior === "auto")).toBe(true);
});

test("keeps a region highlight aligned after zooming", async ({ page }) => {
  await mockDocumentThread(page);
  await openFixture(page, "anchor-single-column.pdf");
  await enableHighlightMode(page);
  await drawRegion(page);
  await page.getByRole("button", { name: "Explain" }).click();

  await expect(page.getByTestId("paper-region-highlight").first()).toBeVisible();
  const before = await readRegionGeometry(page);
  const zoomRatio = 1.3 / 1.15;

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".paper-zoom-controls output")).toHaveText("130%");
  await waitForZoomedSurface(page, before.surface.width, zoomRatio);

  const after = await readRegionGeometry(page);
  expect(after.highlight.width / before.highlight.width).toBeCloseTo(zoomRatio, 2);
  expect(after.highlight.height / before.highlight.height).toBeCloseTo(
    zoomRatio,
    2
  );
  // The highlight keeps its position relative to the page, not its CSS pixels.
  expect(after.relativeLeft).toBeCloseTo(before.relativeLeft, 3);
  expect(after.relativeTop).toBeCloseTo(before.relativeTop, 3);
});

test("keeps a region highlight aligned on a rotated page", async ({ page }) => {
  await mockDocumentThread(page);
  await openFixture(page, "anchor-rotated-page.pdf");
  await enableHighlightMode(page);
  await drawRegion(page, { left: 0.2, top: 0.25, width: 0.4, height: 0.2 });
  await page.getByRole("button", { name: "Explain" }).click();

  await expect(page.getByTestId("paper-region-highlight").first()).toBeVisible();
  const before = await readRegionGeometry(page);
  const zoomRatio = 1.3 / 1.15;

  // The stored page-space rect round-trips back onto the rotated page.
  expect(before.relativeLeft).toBeGreaterThanOrEqual(-0.01);
  expect(before.relativeTop).toBeGreaterThanOrEqual(-0.01);
  expect(
    before.relativeLeft + before.highlight.width / before.surface.width
  ).toBeLessThanOrEqual(1.01);
  expect(before.highlight.width).toBeGreaterThan(20);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".paper-zoom-controls output")).toHaveText("130%");
  await waitForZoomedSurface(page, before.surface.width, zoomRatio);

  const after = await readRegionGeometry(page);
  expect(after.highlight.width / before.highlight.width).toBeCloseTo(zoomRatio, 2);
  expect(after.relativeLeft).toBeCloseTo(before.relativeLeft, 3);
  expect(after.relativeTop).toBeCloseTo(before.relativeTop, 3);
});

test("captures a region on an image-only scan", async ({ page }) => {
  await mockDocumentThread(page, "The scan shows a signed form.");
  await openFixture(page, "anchor-image-only-scan.pdf");
  await expect(page.getByText("No selectable text on this page")).toBeVisible();
  await expect(page.locator("[data-pdf-text-item-index]")).toHaveCount(0);

  await enableHighlightMode(page);
  await drawRegion(page);
  await expect(page.getByTestId("selection-popover-preview")).toBeVisible();
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByText("The scan shows a signed form.")).toBeVisible();
  await expect(page.getByTestId("paper-region-highlight")).toHaveCount(1);
});

test("cancels a mis-click drag silently and exits on Escape", async ({
  page,
}) => {
  await mockDocumentThread(page);
  await openFixture(page, "anchor-single-column.pdf");
  await enableHighlightMode(page);

  const surface = page.locator(".paper-pdf-page-surface").first();
  const box = await surface.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 64, box.y + 63);
  await page.mouse.up();

  await expect(page.getByTestId("selection-popover")).toHaveCount(0);
  await expect(page.getByTestId("paper-region-active")).toHaveCount(0);
  await expect(page.getByTestId("paper-region-highlight")).toHaveCount(0);
  // A mis-click keeps the tool armed rather than silently turning it off.
  await expect(page.getByTestId("paper-highlight-toggle")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("paper-highlight-toggle")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.getByTestId("paper-region-capture-0")).toHaveCount(0);
});

test("keeps multiple region threads independent", async ({ page }) => {
  let answerIndex = 0;
  await page.route("**/api/document-thread", async (route) => {
    answerIndex += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: `Answer number ${answerIndex}.`,
        document: { token: "prepared-token", expiresAt: Date.now() + 600_000 },
      }),
    });
  });
  await openFixture(page, "anchor-single-column.pdf");

  await enableHighlightMode(page);
  await drawRegion(page, { left: 0.1, top: 0.1, width: 0.4, height: 0.12 });
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByText("Answer number 1.")).toBeVisible();
  await page.getByRole("button", { name: "Close paper thread" }).click();

  await enableHighlightMode(page);
  await drawRegion(page, { left: 0.1, top: 0.45, width: 0.4, height: 0.12 });
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByText("Answer number 2.")).toBeVisible();
  await page.getByRole("button", { name: "Close paper thread" }).click();

  const highlights = page.getByTestId("paper-region-highlight");
  await expect(highlights).toHaveCount(2);
  await expect(highlights.nth(0)).toHaveAttribute(
    "aria-label",
    "Highlight 1 on page 1 (ready)"
  );
  await expect(highlights.nth(1)).toHaveAttribute(
    "aria-label",
    "Highlight 2 on page 1 (ready)"
  );

  await highlights.nth(0).click();
  await expect(page.getByTestId("paper-thread-panel")).toContainText(
    "Answer number 1."
  );
  await page.getByRole("button", { name: "Close paper thread" }).click();

  await highlights.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("paper-thread-panel")).toContainText(
    "Answer number 2."
  );
});

test("surfaces a failed region question as a reopenable error", async ({
  page,
}) => {
  await page.route("**/api/document-thread", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "The document model is unavailable." }),
    })
  );
  await openFixture(page, "anchor-single-column.pdf");
  await enableHighlightMode(page);
  await drawRegion(page);
  await page.getByRole("button", { name: "Explain" }).click();

  await expect(page.locator(".paper-thread-error")).toContainText(
    "The document model is unavailable."
  );
  await page.getByRole("button", { name: "Close paper thread" }).click();
  const highlight = page.getByTestId("paper-region-highlight");
  await expect(highlight).toHaveAttribute(
    "aria-label",
    "Highlight 1 on page 1 (error)"
  );
  await highlight.click();
  await expect(page.getByTestId("paper-thread-panel")).toContainText(
    "The document model is unavailable."
  );
});

test("re-prepares the document when the server has forgotten it", async ({
  page,
}) => {
  const bodies = [];
  await page.route("**/api/document-thread", async (route) => {
    const body = route.request().postData() ?? "";
    bodies.push(body);
    if (bodies.length === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "First answer.",
          document: { token: "stale-token", expiresAt: Date.now() + 600_000 },
        }),
      });
      return;
    }
    if (body.includes('name="pdf"')) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "Second answer.",
          document: { token: "fresh-token", expiresAt: Date.now() + 600_000 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "This document needs to be prepared again.",
        needsDocument: true,
      }),
    });
  });
  await openFixture(page, "anchor-single-column.pdf");

  await enableHighlightMode(page);
  await drawRegion(page, { left: 0.1, top: 0.1, width: 0.4, height: 0.12 });
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByText("First answer.")).toBeVisible();
  await page.getByRole("button", { name: "Close paper thread" }).click();

  await enableHighlightMode(page);
  await drawRegion(page, { left: 0.1, top: 0.45, width: 0.4, height: 0.12 });
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByText("Second answer.")).toBeVisible();

  expect(bodies).toHaveLength(3);
  // First question uploads, second reuses the token, the 409 retry re-uploads.
  expect(bodies[0]).toContain('name="pdf"');
  expect(bodies[1]).toContain('name="documentToken"');
  expect(bodies[1]).not.toContain('name="pdf"');
  expect(bodies[2]).toContain('name="pdf"');
});

test("keeps native text selection available outside Highlight mode", async ({
  page,
}) => {
  await openFixture(page, "anchor-single-column.pdf");
  await expect(page.locator("[data-pdf-text-item-index]").first()).toBeVisible();

  const selected = await page.evaluate(() => {
    const item = document.querySelector("[data-pdf-text-item-index]");
    const node = item?.firstChild;
    if (!node) return "";
    const range = document.createRange();
    range.selectNodeContents(item);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });

  expect(selected.length).toBeGreaterThan(0);
  // The region popover only opens from a drawn rectangle, never a selection.
  await expect(page.getByTestId("selection-popover")).toHaveCount(0);
});

for (const [fileName, message] of [
  ["anchor-password-protected.pdf", "Password-protected PDFs are not supported"],
  ["anchor-malformed.pdf", "Invalid PDF structure"],
]) {
  test(`fails recoverably for ${fileName}`, async ({ page }) => {
    await loadFixture(page, fileName);
    await expect(page.locator(".paper-error")).toContainText(message);
    await expect(page.locator(".paper-pdf-page-surface")).toHaveCount(0);
  });
}

test("ignores a stale PDF when a newer import wins the load race", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const originalArrayBuffer = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function patchedArrayBuffer() {
      if (this.name === "slow.pdf") {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      return originalArrayBuffer.call(this);
    };
  });
  await page.goto("/paper-demo?e2e=1");
  const input = page.getByTestId("paper-file-input");
  await input.setInputFiles({
    name: "slow.pdf",
    mimeType: "application/pdf",
    buffer: readFileSync(path.join(fixturesDir, "anchor-single-column.pdf")),
  });
  await input.setInputFiles(path.join(fixturesDir, "anchor-two-column.pdf"));

  await expect(page.locator(".paper-demo-brand h1")).toHaveText(
    "anchor-two-column.pdf"
  );
  await page.waitForTimeout(350);
  await expect(page.locator(".paper-demo-brand h1")).toHaveText(
    "anchor-two-column.pdf"
  );
});
