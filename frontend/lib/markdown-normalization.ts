const PROTECTED_MARKDOWN_PATTERN =
  /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|(?<!~)(~{3,})(?!~)[\s\S]*?(?<!~)\2(?!~)/g;
const MATRIX_ENV_PATTERN =
  /\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|smallmatrix)\}([\s\S]*?)\\end\{\1\}/g;
const BRACKETED_MATRIX_PATTERN = /\[([^\[\]]*\\begin\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|smallmatrix)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|smallmatrix)\}[^\[\]]*)\]/g;
const DISPLAY_MATH_ENVIRONMENT_PATTERN =
  /(^|\n)\$\$([ \t]*(?:\n[ \t]*)?)(\\begin\{(array|aligned|alignedat|gathered|bmatrix|pmatrix|matrix|vmatrix|Vmatrix|Bmatrix|smallmatrix|cases)\}[\s\S]*?\\end\{\4\})([ \t]*(?:\n[ \t]*)?)\$\$(?=[ \t]*(?:\n|$))/g;

function normalizeMatrixRows(content: string) {
  return content.replace(MATRIX_ENV_PATTERN, (_match, environment: string, body: string) => {
    const normalizedBody = body.replace(/(^|[^\\])\\(?=\s*-?\d)/g, (_rowMatch, prefix: string) => {
      return `${prefix}\\\\`;
    });

    return `\\begin{${environment}}${normalizedBody}\\end{${environment}}`;
  });
}

function shouldUseDisplayMath(source: string, offset: number, matchLength: number, body: string) {
  if (body.includes("\n")) return true;

  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const nextLineBreak = source.indexOf("\n", offset + matchLength);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const beforeOnLine = source.slice(lineStart, offset).trim();
  const afterOnLine = source.slice(offset + matchLength, lineEnd).trim();

  return beforeOnLine === "" && afterOnLine === "";
}

function formatDisplayMath(body: string) {
  return `$$\n${body}\n$$`;
}

function formatDisplayMathReplacement(
  source: string,
  offset: number,
  matchLength: number,
  body: string
) {
  const block = formatDisplayMath(body);
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const nextLineBreak = source.indexOf("\n", offset + matchLength);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  const beforeOnLine = source.slice(lineStart, offset).trim();
  const afterOnLine = source.slice(offset + matchLength, lineEnd).trim();

  if (beforeOnLine === "" && afterOnLine === "") {
    return block;
  }

  return `${beforeOnLine ? "\n" : ""}${block}${afterOnLine ? "\n" : ""}`;
}

function normalizeMathTextSegment(content: string) {
  return content
    .replace(
      DISPLAY_MATH_ENVIRONMENT_PATTERN,
      (
        match,
        lineBoundary: string,
        openingGap: string,
        body: string,
        _environment: string,
        closingGap: string
      ) => {
        if (openingGap.includes("\n") && closingGap.includes("\n")) {
          return match;
        }

        return `${lineBoundary}${formatDisplayMath(normalizeMatrixRows(body).trim())}`;
      }
    )
    .replace(/[ \t]*\\\[([\s\S]*?)\\\]/g, (match, body: string, offset: number, source: string) => {
      return formatDisplayMathReplacement(
        source,
        offset,
        match.length,
        normalizeMatrixRows(body).trim()
      );
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, body: string) => {
      return `$${normalizeMatrixRows(body).trim()}$`;
    })
    .replace(BRACKETED_MATRIX_PATTERN, (match, body: string, offset: number, source: string) => {
      if (source[offset - 1] === "!" || source[offset + match.length] === "(") {
        return match;
      }

      const trimmedBody = body.trim();
      if (/[?!.,;:]\s*$/.test(trimmedBody)) {
        return match;
      }

      const delimiter = shouldUseDisplayMath(source, offset, match.length, body) ? "$$" : "$";
      if (delimiter === "$$") {
        return formatDisplayMath(normalizeMatrixRows(trimmedBody));
      }

      return `${delimiter}${normalizeMatrixRows(trimmedBody)}${delimiter}`;
    });
}

export function normalizeMathMarkdown(content: string) {
  if (!content) return content;

  const parts: string[] = [];
  let cursor = 0;

  for (const match of content.matchAll(PROTECTED_MARKDOWN_PATTERN)) {
    const matchStart = match.index ?? 0;

    if (matchStart > cursor) {
      parts.push(normalizeMathTextSegment(content.slice(cursor, matchStart)));
    }

    parts.push(match[0]);
    cursor = matchStart + match[0].length;
  }

  if (cursor < content.length) {
    parts.push(normalizeMathTextSegment(content.slice(cursor)));
  }

  return parts.join("");
}
