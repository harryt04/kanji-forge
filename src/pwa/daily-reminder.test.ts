import { describe, expect, it, vi } from 'vitest'
import {
  countDueReminderCards,
  isDailyReminderTime,
  nextDailyReminderAt,
  openStudyFromDailyReminder,
  showDailyReminderNotification,
} from './daily-reminder'

describe('daily study reminders', () => {
  it('accepts only valid local clock times', () => {
    expect(isDailyReminderTime('09:05')).toBe(true)
    expect(isDailyReminderTime('23:59')).toBe(true)
    expect(isDailyReminderTime('24:00')).toBe(false)
    expect(isDailyReminderTime('9:05')).toBe(false)
  })

  it('schedules the next occurrence and rolls over after the time passes', () => {
    const now = new Date(2026, 7, 7, 18, 30)
    expect(nextDailyReminderAt('19:00', now)).toEqual(
      new Date(2026, 7, 7, 19, 0),
    )
    expect(nextDailyReminderAt('18:00', now)).toEqual(
      new Date(2026, 7, 8, 18, 0),
    )
  })

  it('counts untouched and scheduled due cards but excludes future cards', () => {
    const now = 10_000
    expect(
      countDueReminderCards(
        [
          { state: undefined },
          { state: { level: 2, dueAt: 9_000 } },
          { state: { level: 3, dueAt: 11_000 } },
          { state: { level: 0, dueAt: 1_000 } },
        ],
        now,
      ),
    ).toBe(2)
  })

  it('opens Study when the foreground reminder is activated', () => {
    const navigate = vi.fn()

    openStudyFromDailyReminder(navigate)

    expect(navigate).toHaveBeenCalledWith('/study')
  })

  it('uses the service worker notification path for installed PWAs', async () => {
    const showNotification = vi.fn(async () => undefined)
    vi.stubGlobal('Notification', { permission: 'granted' })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ showNotification }) },
    })

    await expect(showDailyReminderNotification(2)).resolves.toBe(
      'service-worker',
    )
    expect(showNotification).toHaveBeenCalledWith('KanjiForge study reminder', {
      body: '2 cards ready to study.',
      tag: 'kanjiforge-daily-reminder',
      data: { url: '/study' },
    })
  })
})
