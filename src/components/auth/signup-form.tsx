"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Account could not be created.");
      if (data.authenticated) {
        router.replace("/settings/companies");
        router.refresh();
        return;
      }
      setMessage("Check your email to confirm your account, then continue with company setup.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-border bg-background px-3 py-2";
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1 text-sm"><span className="font-medium">Name</span><input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Email</span><input required type="email" maxLength={320} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Password</span><input required type="password" minLength={8} maxLength={256} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Confirm password</span><input required type="password" minLength={8} maxLength={256} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputClass} /></label>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
      <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{busy ? "Creating…" : "Create account"}</button>
      <p className="text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
    </form>
  );
}
