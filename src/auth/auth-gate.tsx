'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AuthShell } from '@/auth/auth-shell'
import { getSession, signOut, type AuthUser } from '@/auth/client'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { AppNavigation } from '@/features/navigation/app-navigation'
import { AutoBackupController, ThemeController } from '@/features/settings'
import { AppBadgeController, DailyReminderController } from '@/pwa'
import { Button } from '@/ui/button'

export function AuthGate({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)

  useEffect(() => {
    let current = true
    void getSession().then((session) => {
      if (!current) return
      if (session) bootstrapUserRuntime(session.id)
      setUser(session)
    })
    return () => {
      current = false
    }
  }, [])

  async function handleSignOut(): Promise<void> {
    clearUserRuntime()
    setUser(null)
    try {
      await signOut()
    } catch {
      // Offline: the server session will simply expire; the local cache is already cleared.
    }
  }

  if (user === undefined) return <AuthShellSkeleton />
  if (!user)
    return (
      <AuthShell
        onAuthenticated={(nextUser) => {
          bootstrapUserRuntime(nextUser.id)
          setUser(nextUser)
        }}
      />
    )

  return (
    <>
      <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          className="border-border bg-card hidden border-r md:flex md:min-h-screen md:flex-col md:gap-8 md:p-5"
          aria-label="Application sidebar"
        >
          <Link className="font-display text-xl font-bold" href="/home">
            KanjiForge
          </Link>
          <AppNavigation userId={user.id} orientation="vertical" />
          <AccountNavigation onSignOut={() => void handleSignOut()} />
        </aside>

        <div className="min-w-0">
          <header className="border-border flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 sm:px-6 md:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                className="font-display shrink-0 text-xl font-bold"
                href="/home"
              >
                KanjiForge
              </Link>
              <AppNavigation userId={user.id} />
            </div>
            <AccountNavigation onSignOut={() => void handleSignOut()} />
          </header>
          {children}
        </div>
      </div>
      <ThemeController userId={user.id} />
      <AutoBackupController userId={user.id} />
      <AppBadgeController userId={user.id} />
      <DailyReminderController userId={user.id} />
    </>
  )
}

function AccountNavigation({
  onSignOut,
}: {
  readonly onSignOut: () => void
}): React.ReactElement {
  return (
    <nav
      className="md:border-border flex items-center gap-1 md:grid md:w-full md:gap-1 md:border-t md:pt-4"
      aria-label="Account"
    >
      <Link
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none md:w-full"
        href="/settings"
      >
        Settings
      </Link>
      <Button
        className="md:justify-start"
        variant="ghost"
        size="sm"
        onClick={onSignOut}
      >
        Sign out
      </Button>
    </nav>
  )
}

/** Matches the AuthShell's two-pane frame so a signed-out visitor sees a shaped
 * placeholder instead of a blank screen while the session check resolves. */
function AuthShellSkeleton(): React.ReactElement {
  return (
    <main
      className="grid min-h-screen sm:grid-cols-2"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="bg-secondary/40 hidden sm:block" />
      <div className="grid place-items-center p-5">
        <div className="w-full max-w-md animate-pulse">
          <div className="bg-secondary h-11 rounded-[var(--radius)]" />
          <div className="bg-secondary mt-6 h-7 w-40 rounded" />
          <div className="bg-secondary mt-3 h-4 w-full rounded" />
          <div className="bg-secondary mt-6 h-11 rounded-md" />
          <div className="bg-secondary mt-4 h-11 rounded-md" />
          <div className="bg-secondary mt-4 h-11 rounded-md" />
        </div>
      </div>
    </main>
  )
}
