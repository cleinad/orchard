export const MARKDOWN_STRUCTURE_SELECTION_STREAM_VERSION = 'markdown-structure-v2';

export type SelectionStreamVersion = typeof MARKDOWN_STRUCTURE_SELECTION_STREAM_VERSION;

export const DEFAULT_SELECTION_STREAM_VERSION: SelectionStreamVersion =
  MARKDOWN_STRUCTURE_SELECTION_STREAM_VERSION;

const BLOCK_TAGS = new Set([
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

const TABLE_SECTION_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot']);
const TABLE_CELL_TAGS = new Set(['td', 'th']);
const TABLE_STRUCTURE_TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'col',
]);
const TEXT_CONTENT_BLOCK_TAGS = new Set([
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

export function getSelectionStreamVersion(
  version: SelectionStreamVersion | string | null | undefined
): SelectionStreamVersion {
  return version === MARKDOWN_STRUCTURE_SELECTION_STREAM_VERSION
    ? MARKDOWN_STRUCTURE_SELECTION_STREAM_VERSION
    : DEFAULT_SELECTION_STREAM_VERSION;
}

export function normalizeTagName(tagName: string | null | undefined) {
  return tagName?.toLowerCase() ?? '';
}

export function isTableCellTag(tagName: string | null | undefined) {
  return TABLE_CELL_TAGS.has(normalizeTagName(tagName));
}

export function isTableRowTag(tagName: string | null | undefined) {
  return normalizeTagName(tagName) === 'tr';
}

export function isTableStructureTag(tagName: string | null | undefined) {
  return TABLE_STRUCTURE_TAGS.has(normalizeTagName(tagName));
}

export function isFormattingWhitespaceText(
  value: string | null | undefined,
  parentTagName: string | null | undefined
) {
  const parentTag = normalizeTagName(parentTagName);
  if (!value || /\S/.test(value)) {
    return false;
  }

  return !parentTag || (BLOCK_TAGS.has(parentTag) && !TEXT_CONTENT_BLOCK_TAGS.has(parentTag));
}

export function isBlockTag(tagName: string | null | undefined) {
  return BLOCK_TAGS.has(normalizeTagName(tagName));
}

export function boundaryBetweenTags(
  parentTagName: string | null | undefined,
  previousTagName: string | null | undefined,
  nextTagName: string | null | undefined
): '\n' | '\t' | null {
  const parentTag = normalizeTagName(parentTagName);
  const previousTag = normalizeTagName(previousTagName);
  const nextTag = normalizeTagName(nextTagName);

  if (!previousTag || !nextTag) {
    return null;
  }

  if (parentTag === 'tr' && TABLE_CELL_TAGS.has(previousTag) && TABLE_CELL_TAGS.has(nextTag)) {
    return '\t';
  }

  if (TABLE_SECTION_TAGS.has(parentTag) && previousTag === 'tr' && nextTag === 'tr') {
    return '\n';
  }

  if ((parentTag === 'ol' || parentTag === 'ul') && previousTag === 'li' && nextTag === 'li') {
    return '\n';
  }

  if (BLOCK_TAGS.has(previousTag) && BLOCK_TAGS.has(nextTag)) {
    return '\n';
  }

  return null;
}
