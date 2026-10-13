"use client";

/** Root failures replace the layout, so recovery must not depend on its router/providers. */
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b1220", color: "#e5e7eb", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "0 24px" }}>
          <section role="alert" style={{ maxWidth: 480, textAlign: "center" }}>
            <h1>This page could not be loaded</h1>
            <p>The connection may have been interrupted. Reload this page or open the dashboard to continue.</p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => window.location.reload()} style={{ padding: "12px 20px", cursor: "pointer" }}>
                Try again
              </button>
              <button type="button" onClick={() => window.location.assign("/")} style={{ padding: "12px 20px", cursor: "pointer" }}>
                Open dashboard
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
