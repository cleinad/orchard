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
    const blockTags = new Set([
      'address',
      'article',
      'aside',
      'blockquote',
      'details',
      'div',
      'dl',
      'fieldset',
      'figcaption',
      'figure',
      'footer',
      'form',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'header',
      'hr',
      'li',
      'main',
      'nav',
      'ol',
      'p',
      'pre',
      'section',
      'table',
      'ul',
    ]);
    const tableSectionTags = new Set(['table', 'thead', 'tbody', 'tfoot']);
    const tableCellTags = new Set(['td', 'th']);
    const tableStructureTags = new Set([
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'colgroup',
      'col',
    ]);
    const textContentBlockTags = new Set([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'li',
      'p',
      'pre',
      'td',
      'th',
    ]);

    const appendSegment = (segment) => {
      if (!segment.text) return;

      segments.push({
        ...segment,
        start: combinedText.length,
        end: combinedText.length + segment.text.length,
      });
      combinedText += segment.text;
    };

    const getTagName = (node) =>
      node instanceof HTMLElement ? node.tagName.toLowerCase() : null;

    const isFormattingWhitespaceText = (value, parentTag) => {
      if (!value || /\S/.test(value)) return false;
      return !parentTag || (blockTags.has(parentTag) && !textContentBlockTags.has(parentTag));
    };

    const getBoundary = (parentTag, previousTag, nextTag) => {
      if (!previousTag || !nextTag) return null;
      if (parentTag === 'tr' && tableCellTags.has(previousTag) && tableCellTags.has(nextTag)) {
        return '\t';
      }
      if (tableSectionTags.has(parentTag) && previousTag === 'tr' && nextTag === 'tr') {
        return '\n';
      }
      if ((parentTag === 'ol' || parentTag === 'ul') && previousTag === 'li' && nextTag === 'li') {
        return '\n';
      }
      if (blockTags.has(previousTag) && blockTags.has(nextTag)) {
        return '\n';
      }
      return null;
    };

    const walkChildren = (parent, parentTag = null) => {
      let previousTag = null;

      parent.childNodes.forEach((child) => {
        if (
          child.nodeType === Node.TEXT_NODE
          && (
            tableStructureTags.has(parentTag)
            || isFormattingWhitespaceText(child.textContent ?? '', parentTag)
          )
        ) {
          return;
        }

        const childTag = getTagName(child);
        const boundary = getBoundary(parentTag, previousTag, childTag);
        if (boundary) {
          appendSegment({
            kind: 'boundary',
            text: boundary,
          });
        }

        const includedTag = walk(child);
        if (includedTag) {
          previousTag = includedTag;
        }
      });
    };

    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendSegment({
          kind: 'text',
          node,
          text: node.textContent ?? '',
        });
        return null;
      }

      if (!(node instanceof HTMLElement)) {
        walkChildren(node);
        return null;
      }

      if (node.matches('[data-selection-exclude]')) {
        return null;
      }

      const selectionText = node.getAttribute('data-selection-text');
      if (selectionText !== null) {
        appendSegment({
          kind: 'atomic',
          element: node,
          text: selectionText,
        });
        return node.tagName.toLowerCase();
      }

      walkChildren(node, node.tagName.toLowerCase());
      return node.tagName.toLowerCase();
    };

    walkChildren(contentEl);

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
    if (startEntry.kind === 'boundary') {
      const nextEntry = segments.find((entry) => entry.kind !== 'boundary' && entry.end > start);
      if (!nextEntry) return false;
      if (nextEntry.kind === 'atomic') {
        range.setStartBefore(nextEntry.element);
      } else {
        range.setStart(nextEntry.node, 0);
      }
    } else if (startEntry.kind === 'atomic') {
      range.setStartBefore(startEntry.element);
    } else {
      range.setStart(startEntry.node, start - startEntry.start);
    }

    if (endEntry.kind === 'boundary') {
      const previousEntry = [...segments]
        .reverse()
        .find((entry) => entry.kind !== 'boundary' && entry.start < end);
      if (!previousEntry) return false;
      if (previousEntry.kind === 'atomic') {
        range.setEndAfter(previousEntry.element);
      } else {
        range.setEnd(previousEntry.node, previousEntry.text.length);
      }
    } else if (endEntry.kind === 'atomic') {
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

  await page.waitForFunction(
    (expectedText) => {
      const popover = document.querySelector('[data-testid="selection-popover"]');
      return popover?.textContent?.includes(expectedText);
    },
    text
  );
}

async function hasPersistentSelectionHighlight(page) {
  return page.evaluate(() => {
    return Boolean(
      document.querySelector(
        '[data-testid="thread-highlight-rect"][data-highlight-kind="active"]'
      )
    );
  });
}

module.exports = {
  hasPersistentSelectionHighlight,
  selectTextInMessage,
};
