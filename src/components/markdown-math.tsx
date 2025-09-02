"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

type Props = { content: string };

export default function MarkdownMath({ content }: Props) {
  return (
    <div className="space-y-2 leading-relaxed">
      <ReactMarkdown
        // GitHub tables/lists + LaTeX ($...$, $$...$$)
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
