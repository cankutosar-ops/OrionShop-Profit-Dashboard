'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function PasswordSetupForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setPending(true); setError('');
    try {
      const result = await fetch('/api/auth/password', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password})});
      if (!result.ok) { setError('Password could not be updated. Check the password requirements or request a new link.'); return; }
      setPassword(''); setConfirmation(''); router.replace('/'); router.refresh();
    } catch { setError('Connection failed. Please try again.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <label className="block">New password<input className="mt-1 w-full rounded border border-border bg-background p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} /></label>
    <label className="block">Confirm password<input className="mt-1 w-full rounded border border-border bg-background p-2" type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label>
    <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    <button disabled={pending} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60">{pending ? 'Saving…' : 'Save password'}</button>
  </form>;
}
