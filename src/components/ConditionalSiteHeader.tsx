"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { TopNavActions } from "@/components/TopNavActions";

export function ConditionalSiteHeader() {
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/demo" || pathname === "/website") return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-foreground no-underline transition-opacity hover:opacity-90">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-sm">
            <BookOpen size={19} strokeWidth={2.3} />
          </span>
          <span className="text-base font-semibold tracking-tight">Education Copilot</span>
        </Link>
        <TopNavActions />
      </div>
    </header>
  );
}
