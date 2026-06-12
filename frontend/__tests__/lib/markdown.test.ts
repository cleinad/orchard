import { describe, expect, it } from 'vitest';
import { normalizeMathMarkdown } from '@/lib/markdown';

describe('normalizeMathMarkdown', () => {
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
});
