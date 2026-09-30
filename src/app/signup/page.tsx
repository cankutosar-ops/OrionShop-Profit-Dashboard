import { SignupForm } from "@/components/auth/signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute left-[-8rem] top-[-8rem] h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-8rem] h-96 w-96 rounded-full bg-chart-6/10 blur-3xl" />
      <div className="auth-card relative w-full max-w-md space-y-7 p-6 sm:p-9">
        <div className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">O</div>
          <h1 className="text-2xl font-bold tracking-tight">Create your OrionShop account</h1>
          <p className="text-sm text-muted-foreground">Connect your own company and Wildberries store.</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
