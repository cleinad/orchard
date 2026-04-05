async function selectTextInMessage(page, messageId, text) {
  const selected = await page.evaluate(({ messageId, text }) => {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!(messageEl instanceof HTMLElement)) {
      return false;
    }

    const walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let combinedText = '';

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? '';
      if (!content) {
        continue;
      }

      textNodes.push({
        node,
        start: combinedText.length,
        end: combinedText.length + content.length,
      });
      combinedText += content;
    }

    const start = combinedText.indexOf(text);
    if (start === -1) {
      return false;
    }

    const end = start + text.length;
    const startEntry = textNodes.find((entry) => start < entry.end);
    const endEntry = textNodes.find((entry) => end <= entry.end);

    if (!startEntry || !endEntry) {
      return false;
    }

    const range = document.createRange();
    range.setStart(startEntry.node, start - startEntry.start);
    range.setEnd(endEntry.node, end - endEntry.start);

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);

    const target =
      range.startContainer.parentElement instanceof HTMLElement
        ? range.startContainer.parentElement
        : messageEl;
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    return true;
  }, { messageId, text });

  if (!selected) {
    throw new Error(`Could not select "${text}" inside message ${messageId}`);
  }
}

async function hasPersistentSelectionHighlight(page) {
  return page.evaluate(() => {
    if (typeof CSS === 'undefined' || !('highlights' in CSS)) {
      return false;
    }

    const registry = CSS.highlights;
    return typeof registry?.get === 'function' && Boolean(registry.get('keen-active-selection'));
  });
}

module.exports = {
  hasPersistentSelectionHighlight,
  selectTextInMessage,
};
