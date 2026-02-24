import { SearchQuestionBox } from "@/components/search-question-box";

export default function SearchPage() {
  return (
    <main className="flex-1 page-bg min-h-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Search Bank Questions</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Retrieve questions from the RAG bank and filter by confidence threshold.
            </p>
          </div>
          <SearchQuestionBox />
        </section>
      </div>
    </main>
  );
}
