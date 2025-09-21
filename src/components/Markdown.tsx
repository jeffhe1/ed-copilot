// components/Markdown.tsx
"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      // If you need raw HTML inside markdown (usually not necessary for LaTeX), uncomment:
      // allowedElements={undefined}
      // disallowedElements={[]}
      // skipHtml={false}
    >
      {children}
    </ReactMarkdown>
  );
}
export default Markdown;