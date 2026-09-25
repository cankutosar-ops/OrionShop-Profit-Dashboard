"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { safeAuthRedirect } from "@/lib/security/safe-auth-redirect";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(payload.message || payload.error || "Invalid email or password");
        return;
      }
      const safeNext = safeAuthRedirect(nextPath);
      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    const normalizedEmail = email.trim();
    setError(null);
    setResetMessage(null);
    if (!normalizedEmail) {
      setError("Enter your email address first.");
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(payload.message || payload.error || "Password reset request failed.");
        return;
      }
      setResetMessage(
        payload.message || "If an account exists for this email, a password reset link has been sent."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset request failed.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <form
      method="post"
      action="/api/auth/login"
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-sm space-y-4"
    >
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <button
            type="button"
            onClick={requestPasswordReset}
            disabled={loading || resetLoading}
            className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {resetMessage ? (
        <p className="text-sm text-success" role="status">
          {resetMessage}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        New to OrionShop?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
