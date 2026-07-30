import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">OrionShop</h1>
          <p className="text-sm text-muted-foreground">Sign in to the Profit Dashboard</p>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
