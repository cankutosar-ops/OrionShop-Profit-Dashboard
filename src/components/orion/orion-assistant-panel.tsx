"use client";

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageCircleQuestion, Sparkles } from "lucide-react";
import { OrionConfidenceBadge } from "@/components/orion/orion-confidence-badge";
import type { OrionCitationAnswer } from "@/lib/orion/types";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "How is Net Profit calculated?",
  "What is the difference between Revenue and Settlement?",
  "What is Model B?",
  "What is Model C?",
  "How is Revenue calculated?",
  "What is Marketplace Fee?",
  "How do returns affect the financial model?",
];

export function OrionAssistantPanel({ className }: { className?: string }) {
  const pathname = usePathname();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<OrionCitationAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceDetail, setSourceDetail] = useState<Record<string, unknown> | null>(null);

  const ask = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setAnswer(null);
      setSelectedSource(null);
      setSourceDetail(null);
      try {
        const res = await fetch("/api/orion/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            context: { route: pathname ?? undefined },
          }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as OrionCitationAnswer;
        setAnswer(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to ask Orion");
      } finally {
        setLoading(false);
      }
    },
    [pathname]
  );

  const inspectSource = useCallback(async (id: string) => {
    setSelectedSource(id);
    setSourceDetail(null);
    try {
      const res = await fetch(`/api/orion/knowledge/${encodeURIComponent(id)}`);
      if (res.ok) {
        setSourceDetail((await res.json()) as Record<string, unknown>);
      }
    } catch {
      setSourceDetail(null);
    }
  }, []);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold tracking-tight">Orion Assistant</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Ask about verified platform knowledge. Orion cites Business Rules and Financial Engine
          sources — it does not calculate or mutate data.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="How is Net Profit calculated?"
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Question for Orion"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircleQuestion className="h-4 w-4" />}
            Ask
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestion(q);
                void ask(q);
              }}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {answer && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Answer</h3>
            <OrionConfidenceBadge confidence={answer.confidence} />
            {answer.unknown && (
              <span className="text-xs text-muted-foreground">No verified knowledge found</span>
            )}
          </div>
          <p className="text-sm leading-relaxed">{answer.answer}</p>

          <div>
            <h4 className="mb-1 text-sm font-medium text-muted-foreground">Why</h4>
            <p className="text-sm leading-relaxed">{answer.why}</p>
          </div>

          {answer.sources.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">Sources</h4>
              <ul className="flex flex-col gap-1">
                {answer.sources.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void inspectSource(s.id)}
                      className={cn(
                        "text-left text-sm text-primary underline-offset-2 hover:underline",
                        selectedSource === s.id && "font-medium"
                      )}
                    >
                      {s.id} — {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sourceDetail && selectedSource && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{String(sourceDetail.title ?? selectedSource)}</p>
              {typeof sourceDetail.description === "string" && (
                <p className="mt-1 text-muted-foreground">{sourceDetail.description}</p>
              )}
              {typeof sourceDetail.formula === "string" && (
                <p className="mt-2 font-mono text-xs">{sourceDetail.formula}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
