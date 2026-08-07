'use client'

import { useEffect, useState } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
  THEME_SETTING,
  type ThemePreference,
} from './theme'

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  description: string
}> = [
  { value: 'light', label: 'Light', description: 'Use the warm paper theme.' },
  { value: 'dark', label: 'Dark', description: 'Use the warm ink theme.' },
  {
    value: 'system',
    label: 'Device setting',
    description: 'Follow your device color-scheme preference.',
  },
  {
    value: 'night',
    label: 'Night schedule',
    description: 'Use dark theme from 21:00 to 06:00 local time.',
  },
]

function getSystemPreference(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export function SettingsScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [preference, setPreference] = useState<ThemePreference>('light')
  const [systemDark, setSystemDark] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runtime) return
    let cancelled = false
    setSystemDark(getSystemPreference())
    void (async () => {
      await runtime.database.ready
      const saved = await createUserRepositories(runtime.database).settings.get(
        THEME_SETTING,
      )
      if (cancelled) return
      if (isThemePreference(saved?.value)) setPreference(saved.value)
      setLoading(false)
    })().catch((reason: unknown) => {
      if (!cancelled) {
        setError(
          reason instanceof Error ? reason.message : 'Could not load settings.',
        )
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [runtime])

  useEffect(() => {
    applyTheme(resolveTheme(preference, new Date(), systemDark))
  }, [preference, systemDark])

  async function choosePreference(next: ThemePreference): Promise<void> {
    if (!runtime || next === preference) return
    setPreference(next)
    setError(null)
    setSaving(true)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: THEME_SETTING,
        value: next,
        updatedAt: Date.now(),
      })
    } catch (reason: unknown) {
      setPreference(preference)
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save theme setting.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!runtime)
    return (
      <p className="text-muted-foreground p-6">Sign in to open Settings.</p>
    )
  if (loading)
    return (
      <p className="text-muted-foreground p-6" aria-busy="true">
        Loading settings…
      </p>
    )

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <p className="font-jp-ui text-muted-foreground text-sm">環境設定</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Settings</h1>
      <section className="border-border bg-card mt-8 rounded-[var(--radius)] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Choose how KanjiForge should look. Your choice is saved on this device
          and works offline.
        </p>
        <div className="mt-5 grid gap-3" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.filter(({ value }) =>
            THEME_PREFERENCES.includes(value),
          ).map(({ value, label, description }) => (
            <Button
              key={value}
              type="button"
              variant={preference === value ? 'secondary' : 'outline'}
              aria-checked={preference === value}
              role="radio"
              disabled={saving}
              className="h-auto min-h-14 justify-start px-4 py-3 text-left"
              onClick={() => void choosePreference(value)}
            >
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="text-muted-foreground block text-sm font-normal">
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
        {error && (
          <p className="text-destructive mt-4 text-sm" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
