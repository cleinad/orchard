async function selectTextInMessage(page, messageId, text) {
  const selected = await page.evaluate(({ messageId, text }) => {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!(messageEl instanceof HTMLElement)) {
      return false;
    }

    const contentEl = messageEl.querySelector('[data-message-content]');
    if (!(contentEl instanceof HTMLElement)) {
      return false;
    }

    const segments = [];
    let combinedText = '';

    const appendSegment = (segment) => {
      if (!segment.text) return;

      segments.push({
        ...segment,
        start: combinedText.length,
        end: combinedText.length + segment.text.length,
      });
      combinedText += segment.text;
    };

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendSegment({
          kind: 'text',
          node,
          text: node.textContent ?? '',
        });
        return;
      }

      if (!(node instanceof HTMLElement)) {
        node.childNodes.forEach(walk);
        return;
      }

      if (node.matches('[data-selection-exclude]')) {
        return;
      }

      const selectionText = node.getAttribute('data-selection-text');
      if (selectionText !== null) {
        appendSegment({
          kind: 'atomic',
          element: node,
          text: selectionText,
        });
        return;
      }

      node.childNodes.forEach(walk);
    };

    contentEl.childNodes.forEach(walk);

    const start = combinedText.indexOf(text);
    if (start === -1) {
      return false;
    }

    const end = start + text.length;
    const startEntry = segments.find((entry) => start < entry.end);
    const endEntry = segments.find((entry) => end <= entry.end);

    if (!startEntry || !endEntry) {
      return false;
    }

    const range = document.createRange();
    if (startEntry.kind === 'atomic') {
      range.setStartBefore(startEntry.element);
    } else {
      range.setStart(startEntry.node, start - startEntry.start);
    }

    if (endEntry.kind === 'atomic') {
      range.setEndAfter(endEntry.element);
    } else {
      range.setEnd(endEntry.node, end - endEntry.start);
    }

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
