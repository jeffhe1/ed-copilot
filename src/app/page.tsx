import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex-1 page-bg min-h-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              AI-powered STEM practice
            </span>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight">
                Generate high-quality STEM questions in seconds.
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Education Copilot helps teachers and students create tailored multiple-choice
                questions with explanations, graphs, and performance analytics.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/app">Open the app</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
              <div>
                <div className="text-foreground font-semibold">Instant generation</div>
                <div>Prompt → quiz in seconds</div>
              </div>
              <div>
                <div className="text-foreground font-semibold">STEM-focused</div>
                <div>Maths, physics, chemistry, and more</div>
              </div>
              <div>
                <div className="text-foreground font-semibold">Actionable insights</div>
                <div>Track accuracy and mastery</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/95 shadow-sm p-6 space-y-4">
            <div className="text-sm font-semibold text-muted-foreground">What you get</div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                Generate multiple-choice questions with answers and explanations.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                Auto-render math and graphs for visual learning.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                Save attempts and monitor performance trends.
              </li>
            </ul>
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              Built for classrooms, tutoring, and independent study.
            </div>
          </div>
        </section>

        <section className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Focused prompts",
              description: "Target VCE-aligned topics with fine-grained control.",
            },
            {
              title: "Interactive quizzes",
              description: "Students can answer, review, and reset attempts.",
            },
            {
              title: "Performance dashboard",
              description: "View mastery and accuracy across subjects.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="text-base font-semibold">{f.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to create your next quiz?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Launch the app and start generating questions tailored to your class.
          </p>
          <div className="mt-5 flex justify-center">
            <Button asChild>
              <Link href="/app">Get started</Link>
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
