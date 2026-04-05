const INLINE_THREADS_SELECTED_TEXT = 'microtasks run before the browser paints the next frame';
const FIXTURE_MESSAGE_IDS = {
  'inline-threads': 'assistant-inline-threads-fixture',
  'inline-threads-persistent': 'assistant-inline-threads-persistent-fixture',
};

async function gotoHomeFixture(page, fixture = 'inline-threads') {
  const messageId = FIXTURE_MESSAGE_IDS[fixture];
  if (!messageId) {
    throw new Error(`Unknown home fixture: ${fixture}`);
  }

  await page.addInitScript(() => {
    window.localStorage.setItem('learningMode', 'true');
  });
  await page.goto(`/home?e2e=${fixture}`);
  await page.waitForSelector(`[data-message-id="${messageId}"]`);

  return {
    messageId,
    selectedText: INLINE_THREADS_SELECTED_TEXT,
  };
}

module.exports = {
  FIXTURE_MESSAGE_IDS,
  INLINE_THREADS_SELECTED_TEXT,
  gotoHomeFixture,
};
