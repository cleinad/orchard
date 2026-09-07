import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import productionArrayFixture from '@/test-fixtures/markdown/malformed-production-array.json';
import {
  markdownRehypePlugins,
  markdownRemarkPlugins,
  normalizeMathMarkdown,
} from '@/lib/markdown';

describe('normalizeMathMarkdown', () => {
  it('repairs the exact malformed array returned in production', () => {
    expect(normalizeMathMarkdown(productionArrayFixture.malformedMarkdown)).toBe(
      productionArrayFixture.normalizedMarkdown
    );
  });

  it('renders the normalized production array without a KaTeX error', () => {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: markdownRemarkPlugins,
          rehypePlugins: markdownRehypePlugins,
        },
        normalizeMathMarkdown(productionArrayFixture.malformedMarkdown)
      )
    );

    expect(html).toContain('class="katex-display"');
    expect(html).not.toContain('katex-error');
    expect(html).not.toContain('data-math-render-error');
  });

  it('converts standalone bracketed matrix math to display math and repairs numeric rows', () => {
    const input = String.raw`[ \begin{bmatrix}1\0\end{bmatrix},\quad\begin{bmatrix}0\1\end{bmatrix},\quad\begin{bmatrix}3\-2\end{bmatrix} ]`;

    expect(normalizeMathMarkdown(input)).toBe(
      String.raw`$$
\begin{bmatrix}1\\0\end{bmatrix},\quad\begin{bmatrix}0\\1\end{bmatrix},\quad\begin{bmatrix}3\\-2\end{bmatrix}
$$`
    );
  });

  it('converts inline bracketed matrix math but leaves punctuation-ambiguous brackets alone', () => {
    const input = String.raw`[ \begin{bmatrix}2\4\end{bmatrix} ] in the span of [ \begin{bmatrix}1\2\end{bmatrix}? ]`;

    expect(normalizeMathMarkdown(input)).toBe(
      String.raw`$\begin{bmatrix}2\\4\end{bmatrix}$ in the span of [ \begin{bmatrix}1\2\end{bmatrix}? ]`
    );
  });

  it('normalizes escaped LaTeX delimiters', () => {
    const input = String.raw`Use \(v_3\) and \[ \begin{bmatrix}1\2\end{bmatrix} \]`;

    expect(normalizeMathMarkdown(input)).toBe(
      String.raw`Use $v_3$ and
$$
\begin{bmatrix}1\\2\end{bmatrix}
$$`
    );
  });

  it('does not normalize inline code or fenced code blocks', () => {
    const input = [
      'Inline: `[ \\begin{bmatrix}1\\0\\end{bmatrix} ]`',
      '',
      '```tex',
      '[ \\begin{bmatrix}1\\0\\end{bmatrix} ]',
      '```',
    ].join('\n');

    expect(normalizeMathMarkdown(input)).toBe(input);
  });

  it('does not normalize code with longer Markdown delimiters', () => {
    const malformedDisplay = '$$\\begin{array}{l}x\\end{array}$$';
    const input = [
      `Inline: \`\`${malformedDisplay}\`\``,
      '',
      '````markdown',
      '```text',
      malformedDisplay,
      '```',
      '````',
      '',
      '~~~~text',
      malformedDisplay,
      '~~~~',
    ].join('\n');

    expect(normalizeMathMarkdown(input)).toBe(input);
  });

  it('leaves correct display fences, currency, and unmatched delimiters unchanged', () => {
    const input = [
      '$$',
      String.raw`\begin{aligned}a &= b\end{aligned}`,
      '$$',
      '',
      'The budget is $$5 before tax.',
      'An unmatched $$ delimiter stays literal.',
    ].join('\n');

    expect(normalizeMathMarkdown(input)).toBe(input);
  });
});

describe('KaTeX error fallback', () => {
  it('keeps rejected math readable without the default red error treatment', () => {
    const html = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: markdownRemarkPlugins,
          rehypePlugins: markdownRehypePlugins,
        },
        '$$\nx & y\n$$'
      )
    );

    expect(html).toContain('class="katex-error"');
    expect(html).toContain('data-math-render-error="true"');
    expect(html).toContain('aria-label="Math could not be rendered"');
    expect(html).toContain('style="color:inherit"');
    expect(html).not.toContain('#cc0000');
    expect(html).toContain('x &amp; y');
  });
});
