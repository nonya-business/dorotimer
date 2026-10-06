import { useCallback, useEffect, useState } from 'react'

/** One focus session: finished, or reset partway (then `minutes` is the time actually done). */
export type Session = {
  /** When it ended, in milliseconds since 1970. */
  at: number
  minutes: number
  completed: boolean
}

export type Background = 'grid' | 'topography'

const SESSIONS_KEY = 'dorotimer:sessions'
const BACKGROUND_KEY = 'dorotimer:background'
/** The knob's longest focus length; a session this long is drawn at full brightness. */
export const MAX_MINUTES = 90
/** A session reset before this is too short to keep. */
const MIN_KEEP_MINUTES = 0.5

// Browser storage can be refused (private windows, blocked site data): then nothing is kept
// between visits, but the page still works.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // See read().
  }
}

function isSession(s: unknown): s is Session {
  const v = s as Session
  return typeof v?.at === 'number' && typeof v?.minutes === 'number' && typeof v?.completed === 'boolean'
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(() => read<unknown[]>(SESSIONS_KEY, []).filter(isSession))
  useEffect(() => write(SESSIONS_KEY, sessions), [sessions])

  const add = useCallback((minutes: number, completed: boolean) => {
    if (minutes < MIN_KEEP_MINUTES) return
    setSessions((list) => [...list, { at: Date.now(), minutes: Math.min(MAX_MINUTES, minutes), completed }])
  }, [])

  return { sessions, setSessions, add }
}

export function useBackground() {
  const [background, setBackground] = useState<Background>(() =>
    read<Background>(BACKGROUND_KEY, 'grid') === 'topography' ? 'topography' : 'grid',
  )
  useEffect(() => write(BACKGROUND_KEY, background), [background])
  return [background, setBackground] as const
}

export function isToday(at: number) {
  const d = new Date(at)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/** Test data for the developer section: `count` sessions spread over the past days, oldest first. */
export function generateSessions(count: number, minMinutes: number, maxMinutes: number, resetShare: number): Session[] {
  const lo = Math.max(1, Math.min(minMinutes, maxMinutes))
  const hi = Math.min(MAX_MINUTES, Math.max(minMinutes, maxMinutes))
  const now = Date.now()
  // Roughly six sessions a day, going back as far as needed.
  const span = Math.max(1, count / 6) * 86_400_000
  const list: Session[] = []
  for (let i = 0; i < count; i++) {
    list.push({
      at: Math.round(now - span + (span * (i + Math.random() * 0.8)) / count),
      minutes: Math.round(lo + Math.random() * (hi - lo)),
      completed: Math.random() >= resetShare,
    })
  }
  return list
}
