import { redirect } from 'next/navigation';
import { createAuthServerClient } from '@/lib/supabase/auth-server';
import { PasswordSetupForm } from '@/components/auth/password-setup-form';

export const dynamic = 'force-dynamic';

export default async function PasswordSetupPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <main className="flex min-h-screen items-center justify-center p-4">
    <section className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
      <h1 className="text-xl font-semibold">Set your password</h1>
      <p className="text-sm text-muted-foreground">Choose a password for your OrionShop account.</p>
      <PasswordSetupForm />
    </section>
  </main>;
}
