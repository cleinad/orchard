import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import type { Options } from "react-markdown";
import remarkMath from "remark-math";

export const markdownRemarkPlugins = [remarkMath] satisfies NonNullable<Options["remarkPlugins"]>;

export const markdownRehypePlugins = [
  rehypeKatex,
  [rehypeHighlight, { ignoreMissing: true }],
] satisfies NonNullable<Options["rehypePlugins"]>;

export const markdownContentClassName = "markdown-content";
