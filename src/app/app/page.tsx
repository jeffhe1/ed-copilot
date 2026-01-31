import { PromptBox } from "@/components/promptbox";

export default function AppPage() {
  return (
    <main className="flex-1 page-bg min-h-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Create a new STEM quiz
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Describe the topic and level, then generate a quiz with answers, explanations, and
              optional graphs.
            </p>
          </div>
          <div className="w-full max-w-[760px]">
            <PromptBox />
          </div>
        </section>
      </div>
    </main>
  );
}
