'use client'

import { type FormEvent, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { register, signIn, type AuthUser } from '@/auth/client'
import { MarketingTileWall } from '@/features/marketing/marketing-tile-wall'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'

export type AuthMode = 'sign-in' | 'register'

const TRUST_BULLETS = [
  'Works fully offline once installed',
  'Full export of your data, any time, as an open file',
  'Open source — self-hostable if you want to run your own',
] as const

/** Maps the auth client's thrown errors to the plain, in-the-user's-frame voice
 * from docs/BRAND-DESIGN-LANGUAGE.md §2 — never a raw fetch/network exception. */
function describeError(reason: unknown): string {
  if (reason instanceof TypeError) {
    return "Couldn't reach the sign-in server — check your connection and try again."
  }
  return reason instanceof Error ? reason.message : 'Authentication failed.'
}

/**
 * Shared sign-in / create-account surface. Used three ways: the standalone
 * `/sign-in` and `/sign-up` routes (mode switch navigates between real, linkable
 * routes via `modeHrefs`), and inline by `AuthGate` when an unauthenticated visitor
 * hits a protected deep link (mode switch just flips local state, no `modeHrefs`,
 * so the user lands back on the page they wanted after authenticating).
 */
export function AuthShell({
  initialMode = 'sign-in',
  modeHrefs,
  onAuthenticated,
}: {
  readonly initialMode?: AuthMode
  readonly modeHrefs?: { readonly signIn: string; readonly register: string }
  onAuthenticated(user: AuthUser): void
}): React.ReactElement {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const passwordHintId = useId()

  useEffect(() => setMode(initialMode), [initialMode])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setIsOffline(!navigator.onLine)
    const goOnline = (): void => setIsOffline(false)
    const goOffline = (): void => setIsOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (isOffline) {
      setError(
        "You're offline right now — signing in needs a connection. Try again once you're back online.",
      )
      return
    }
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    setPending(true)
    setError(null)
    try {
      onAuthenticated(
        mode === 'sign-in'
          ? await signIn(email, password)
          : await register(email, password),
      )
    } catch (reason) {
      setError(describeError(reason))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="grid min-h-screen sm:grid-cols-2">
      <div className="bg-secondary/40 relative hidden overflow-hidden sm:flex sm:flex-col sm:justify-between sm:p-10">
        <MarketingTileWall className="opacity-40" columns={12} />
        <div className="relative">
          <Link href="/" className="font-display text-2xl font-bold">
            Kanji<span className="text-primary">Forge</span>
          </Link>
          <p className="font-jp-ui text-muted-foreground mt-2 text-sm">
            漢字を鍛える
          </p>
        </div>
        <ul className="relative grid gap-3 text-sm" role="list">
          {TRUST_BULLETS.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2">
              <span className="text-primary mt-0.5" aria-hidden="true">
                ✓
              </span>
              <span className="text-foreground/90">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid place-items-center p-5">
        <section className="w-full max-w-md">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex min-h-11 items-center text-sm sm:hidden"
          >
            ← Back to KanjiForge
          </Link>

          <div
            className="border-border bg-secondary mb-6 grid grid-cols-2 gap-1 rounded-[var(--radius)] border p-1"
            role="group"
            aria-label="Sign in or create an account"
          >
            <ModeControl
              active={mode === 'sign-in'}
              label="Sign in"
              href={modeHrefs?.signIn}
              onSelect={() => {
                setError(null)
                setMode('sign-in')
              }}
            />
            <ModeControl
              active={mode === 'register'}
              label="Create account"
              href={modeHrefs?.register}
              onSelect={() => {
                setError(null)
                setMode('register')
              }}
            />
          </div>

          <h1 className="font-display text-2xl font-bold">
            {mode === 'sign-in' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            An account exists so your reviews can sync between your devices.
            Study data still lives on this device first.
          </p>

          {isOffline && (
            <p
              role="status"
              className="border-border bg-muted text-muted-foreground mt-4 rounded-md border px-3 py-2 text-sm"
            >
              You&apos;re offline. Reconnect to sign in.
            </p>
          )}

          <form
            className="mt-6 grid gap-4"
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <label className="grid gap-1.5 text-sm font-medium">
              Email
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                className="border-input bg-background h-11 rounded-md border px-3 text-base"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Password
              <div className="relative">
                <input
                  required
                  minLength={8}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={
                    mode === 'sign-in' ? 'current-password' : 'new-password'
                  }
                  aria-label="Password"
                  aria-describedby={
                    mode === 'register' ? passwordHintId : undefined
                  }
                  className="border-input bg-background h-11 w-full rounded-md border px-3 pr-16 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 min-w-11 px-3 text-xs font-medium"
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'register' && (
                <span
                  id={passwordHintId}
                  className="text-muted-foreground text-xs"
                >
                  At least 8 characters.
                </span>
              )}
            </label>
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button size="lg" type="submit" disabled={pending || isOffline}>
              {pending && <span role="status">Please wait…</span>}
              {!pending && (mode === 'sign-in' ? 'Sign in' : 'Create account')}
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}

function ModeControl({
  active,
  label,
  href,
  onSelect,
}: {
  readonly active: boolean
  readonly label: string
  readonly href?: string
  onSelect(): void
}): React.ReactElement {
  const className = cn(
    'min-h-9 rounded-[calc(var(--radius)-6px)] px-3 text-sm font-medium transition-colors',
    active
      ? 'bg-background text-foreground shadow-sm'
      : 'text-muted-foreground hover:text-foreground',
  )
  if (href && !active) {
    return (
      <Link href={href} className={cn(className, 'text-center')}>
        {label}
      </Link>
    )
  }
  return (
    <button type="button" className={className} onClick={onSelect}>
      {label}
    </button>
  )
}
