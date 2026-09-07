import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import type { Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export { normalizeMathMarkdown } from "@/lib/markdown-normalization";

interface MarkdownHastNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: MarkdownHastNode[];
}

function rehypeMathErrorFallback() {
  return (tree: MarkdownHastNode) => {
    const annotateErrors = (node: MarkdownHastNode) => {
      const classNames = Array.isArray(node.properties?.className)
        ? node.properties.className
        : [];

      if (classNames.includes("katex-error")) {
        node.properties = {
          ...node.properties,
          "aria-label": "Math could not be rendered",
          "data-math-render-error": "true",
          role: "note",
          title: "Math could not be rendered",
        };
      }

      node.children?.forEach(annotateErrors);
    };

    annotateErrors(tree);
  };
}

export const markdownRemarkPlugins = [
  remarkGfm,
  remarkMath,
] satisfies NonNullable<Options["remarkPlugins"]>;

export const markdownRehypePlugins = [
  [rehypeKatex, { errorColor: "inherit" }],
  rehypeMathErrorFallback,
  [rehypeHighlight, { ignoreMissing: true }],
] satisfies NonNullable<Options["rehypePlugins"]>;

export const markdownContentClassName = "markdown-content";
