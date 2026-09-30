"use client";

import { useEffect } from "react";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

function isTransientConnectionError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  );
}

export default function AppError({ error }: AppErrorProps) {
  const transient = isTransientConnectionError(error);

  useEffect(() => {
    console.error("[app-error]", error);

  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <section className="surface-card w-full max-w-lg p-6 text-center sm:p-8" role="alert">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-warning/10 text-xl text-warning">
          !
        </div>
        <h1 className="text-xl font-bold tracking-tight">
          {transient ? "Connection was interrupted" : "This page could not be loaded"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {transient
            ? "The connection closed before loading finished. Reload this page to try again."
            : "The rest of the application is still available. Try loading this page again."}
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-ui hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground transition-ui hover:bg-card-hover"
          >
            Open dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
