import { SignupForm } from "@/components/auth/signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border bg-card p-8">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Create your OrionShop account</h1>
          <p className="text-sm text-muted-foreground">Connect your own company and Wildberries store.</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
