// app/page.tsx
"use client";

import { PromptBox } from "@/components/promptbox";
import InteractiveQuiz from "@/components/interactive-quiz";
import { StudentProfileCard } from "@/components/StudentProfileCard";

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] gap-6">
        <section className="min-w-0">
          <div className="w-full max-w-[720px]">
            <PromptBox />
          </div>
          <div className="h-4" />
        </section>

        <aside className="min-w-0 lg:sticky lg:top-4">
          <StudentProfileCard />
        </aside>
      </div>
    </main>
  );
}
