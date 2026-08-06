'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, register, signIn, signOut, type AuthUser } from '@/auth/client';
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime';
import { Button } from '@/ui/button';

export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void getSession().then((session) => {
      if (!current) return;
      if (session) bootstrapUserRuntime(session.id);
      setUser(session);
    });
    return () => {
      current = false;
    };
  }, []);

  async function handleSignOut(): Promise<void> {
    clearUserRuntime();
    setUser(null);
    await signOut();
  }

  if (user === undefined) return <main className="min-h-screen" aria-busy="true" />;
  if (!user) return <AuthShell onAuthenticated={(nextUser) => { bootstrapUserRuntime(nextUser.id); setUser(nextUser); }} />;

  return (
    <>
      <header className="flex min-h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <Link className="font-display text-xl font-bold" href="/">KanjiForge</Link>
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>Sign out</Button>
      </header>
      {children}
    </>
  );
}

function AuthShell({ onAuthenticated }: { onAuthenticated(user: AuthUser): void }): React.ReactElement {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    setPending(true); setError(null);
    try {
      onAuthenticated(mode === 'sign-in' ? await signIn(email, password) : await register(email, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed.');
    } finally { setPending(false); }
  }

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="font-jp-ui text-sm text-muted-foreground">漢字を鍛える</p>
        <h1 className="mt-2 font-display text-3xl font-bold">KanjiForge</h1>
        <p className="mt-3 text-muted-foreground">Build lasting Japanese knowledge, one review at a time.</p>
        <form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1.5 text-sm font-medium">Email<input required name="email" type="email" autoComplete="email" className="h-11 rounded-md border border-input bg-background px-3 text-base" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Password<input required minLength={8} name="password" type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} className="h-11 rounded-md border border-input bg-background px-3 text-base" /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button size="lg" type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</Button>
        </form>
        <button className="mt-5 min-h-11 text-sm text-primary underline-offset-4 hover:underline" onClick={() => { setError(null); setMode(mode === 'sign-in' ? 'register' : 'sign-in'); }}>
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  );
}
