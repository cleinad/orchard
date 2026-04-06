const INLINE_THREADS_SELECTED_TEXT = 'microtasks run before the browser paints the next frame';
const REPEATED_TEXT = 'before paint';
const REPEATED_CONTENT =
  'One update can happen before paint, and another can also happen before paint when microtasks keep draining.';
const BULLET_LIST_TEXT = 'microtasks can delay visible paint until queued work finishes';

const FIXTURE_CONFIGS = {
  'inline-threads': {
    messageId: 'assistant-inline-threads-fixture',
    selectedText: INLINE_THREADS_SELECTED_TEXT,
  },
  'inline-threads-persistent': {
    messageId: 'assistant-inline-threads-persistent-fixture',
    selectedText: INLINE_THREADS_SELECTED_TEXT,
  },
  'inline-threads-offset-render': {
    messageId: 'assistant-inline-threads-ordered-list-fixture',
    selectedText: INLINE_THREADS_SELECTED_TEXT,
  },
  'inline-threads-repeated-text': {
    messageId: 'assistant-inline-threads-repeated-text-fixture',
    selectedText: REPEATED_TEXT,
    expectedLinkOffset: REPEATED_CONTENT.indexOf(
      REPEATED_TEXT,
      REPEATED_CONTENT.indexOf(REPEATED_TEXT) + 1
    ),
  },
  'inline-threads-bullet-list': {
    messageId: 'assistant-inline-threads-bullet-list-fixture',
    selectedText: BULLET_LIST_TEXT,
  },
};

async function gotoHomeFixture(page, fixture = 'inline-threads') {
  const fixtureConfig = FIXTURE_CONFIGS[fixture];
  if (!fixtureConfig) {
    throw new Error(`Unknown home fixture: ${fixture}`);
  }

  await page.addInitScript(() => {
    window.localStorage.setItem('learningMode', 'true');
  });
  await page.goto(`/home?e2e=${fixture}`);
  await page.waitForSelector(`[data-message-id="${fixtureConfig.messageId}"]`);

  return {
    ...fixtureConfig,
  };
}

module.exports = {
  FIXTURE_CONFIGS,
  INLINE_THREADS_SELECTED_TEXT,
  gotoHomeFixture,
};
