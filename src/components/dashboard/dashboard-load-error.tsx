"use client";

export function DashboardLoadError({ pageName = "Dashboard" }: { pageName?: string }) {
  return (
    <section className="surface-card mx-auto my-8 max-w-lg p-6 text-center" role="alert">
      <h1 className="text-xl font-bold">{`${pageName} could not finish loading`}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live data is temporarily unavailable. Reload the page to try again.
      </p>
      <button type="button" onClick={() => window.location.reload()}
        className="mt-5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
        Reload page
      </button>
    </section>
  );
}
