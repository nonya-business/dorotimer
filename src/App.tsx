import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { TextMorph } from 'torph/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { GridBackground, TopographyBackground } from '@/components/backgrounds'
import { Knob } from '@/components/knob'
import { Settings } from '@/components/settings'
import { cn } from '@/lib/utils'
import { buttonSound, doneSound, pauseSound, setMuted, startSound, switchSound, tick, zoomInSound, zoomOutSound, unlockSound, wakeSound } from '@/lib/sound'
import { isToday, useBackground, useSessions } from '@/lib/sessions'

/** Which part of a run is counting down: the focus, then (if one is set) the break. */
type Segment = 'focus' | 'break'
type Phase = 'idle' | 'running' | 'paused' | 'done'

// Focus moves in 10-minute steps; holding the knob still zooms in for single minutes.
const FOCUS = { minutes: 30, min: 10, max: 90, step: 10 }
// The break is set on the same knob (pull past the start and hold): off, or 5 to 30 minutes.
const BREAK = { minutes: 5, min: 0, max: 30, step: 5 }
const BREAK_KEY = 'dorotimer:break'
// Holding the main button this long resets a run; a press longer than PRESS_MS isn't a click.
const RESET_HOLD_MS = 5000
const PRESS_MS = 300

const EASE = 'cubic-bezier(0.19, 1, 0.22, 1)'

function readMuted() {
  try {
    return localStorage.getItem('dorotimer:muted') === '1'
  } catch {
    return false
  }
}

function readBreak() {
  try {
    const v = Number(localStorage.getItem(BREAK_KEY))
    return localStorage.getItem(BREAK_KEY) !== null && v >= BREAK.min && v <= BREAK.max ? v : BREAK.minutes
  } catch {
    return BREAK.minutes
  }
}

function clock(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function useDarkClass() {
  useEffect(() => {
    const q = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', q.matches)
    apply()
    q.addEventListener('change', apply)
    return () => q.removeEventListener('change', apply)
  }, [])
}

export default function App() {
  useDarkClass()
  const [segment, setSegment] = useState<Segment>('focus')
  const [focusMinutes, setFocusMinutes] = useState(FOCUS.minutes)
  const [breakMinutes, setBreakMinutes] = useState(readBreak)
  const [phase, setPhase] = useState<Phase>('idle')
  const [left, setLeft] = useState(FOCUS.minutes * 60_000)
  const { sessions, setSessions, add } = useSessions()
  const [background, setBackground] = useBackground()
  const [muted, setMutedState] = useState(readMuted)
  // Counting down from a fixed end time keeps the clock exact even when the tab sleeps.
  const endAt = useRef(0)

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      const rest = endAt.current - Date.now()
      // Wake the audio output shortly before the end, so the chime plays on time.
      if (rest < 2500) wakeSound()
      if (rest > 0) return setLeft(rest)
      if (segment === 'focus') {
        add(focusMinutes, true)
        doneSound('focus')
        // With a break set, the run carries straight on into it.
        if (breakMinutes > 0) {
          endAt.current = Date.now() + breakMinutes * 60_000
          setLeft(breakMinutes * 60_000)
          return setSegment('break')
        }
      } else {
        doneSound('break')
      }
      setLeft(0)
      setPhase('done')
    }, 200)
    return () => clearInterval(id)
  }, [phase, segment, focusMinutes, breakMinutes, add])

  useEffect(() => {
    try {
      localStorage.setItem(BREAK_KEY, String(breakMinutes))
    } catch {
      // Private windows can refuse storage; the setting then lasts for this visit only.
    }
  }, [breakMinutes])

  useEffect(() => {
    setMuted(muted)
    try {
      localStorage.setItem('dorotimer:muted', muted ? '1' : '0')
    } catch {
      // Private windows can refuse storage; the setting then lasts for this visit only.
    }
  }, [muted])

  useEffect(() => {
    document.title = phase === 'running' ? `${clock(left)} · ${segment === 'focus' ? 'Focus' : 'Break'}` : 'dorotimer'
  }, [phase, left, segment])

  /** A focus stopped partway (reset, or its length changed) still counts, as reset. */
  function abandon() {
    if (segment === 'focus' && (phase === 'running' || phase === 'paused')) {
      add((focusMinutes * 60_000 - left) / 60_000, false)
    }
  }

  /** Back to the start, ready for a new run. */
  function toIdle(focus = focusMinutes) {
    setSegment('focus')
    setLeft(focus * 60_000)
    setPhase('idle')
  }

  function setLength(value: number) {
    tick()
    abandon()
    setFocusMinutes(value)
    toIdle(value)
  }

  function setBreak(value: number) {
    tick()
    setBreakMinutes(value)
  }

  function primary() {
    if (phase === 'running') {
      pauseSound()
      return setPhase('paused')
    }
    if (phase === 'done') {
      buttonSound()
      return toIdle()
    }
    startSound()
    endAt.current = Date.now() + left
    setPhase('running')
  }

  function reset() {
    buttonSound()
    abandon()
    toIdle()
  }

  // Reset by holding the main button: it fills red from left to right, and resets when full.
  // Letting go early cancels it, and a long press doesn't count as a click.
  const [holding, setHolding] = useState(false)
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; since: number; long: boolean }>({ since: 0, long: false })
  const resetRef = useRef(reset)
  resetRef.current = reset
  const canReset = phase === 'running' || phase === 'paused'

  function beginHold() {
    // Start, Next: nothing to reset, so every press is a plain click.
    if (!canReset) return
    hold.current = { since: performance.now(), long: false }
    setHolding(true)
    hold.current.timer = setTimeout(() => {
      setHolding(false)
      hold.current.long = true
      resetRef.current()
    }, RESET_HOLD_MS)
  }

  /** Ends a hold; true when it was long enough not to count as a click. */
  function endHold() {
    clearTimeout(hold.current.timer)
    setHolding(false)
    const long = hold.current.long || (hold.current.since > 0 && performance.now() - hold.current.since > PRESS_MS)
    hold.current = { since: 0, long: false }
    return long
  }

  const today = sessions.filter((s) => s.completed && isToday(s.at)).length
  const status = holding ? 'Hold to reset' : phase === 'paused' ? 'Paused' : ''
  const caption =
    segment === 'break' && phase !== 'done' ? 'Break' : phase === 'done' || breakMinutes === 0 ? '' : `+ ${breakMinutes} min break`
  const action = { idle: 'Start', running: 'Pause', paused: 'Resume', done: 'Next' }[phase]

  return (
    <main
      className="flex min-h-svh items-center justify-center px-4 py-10 text-foreground"
      onPointerDownCapture={unlockSound}
      onKeyDownCapture={unlockSound}
      onPointerMove={wakeSound}
    >
      {background === 'grid' ? <GridBackground sessions={sessions} /> : <TopographyBackground sessions={sessions} />}
      <Card className="relative z-10 w-full max-w-lg gap-6 py-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-lg">dorotimer</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-6 px-2.5 text-sm tabular-nums">
              <TextMorph duration={500} ease={EASE}>
                {`${today} today`}
              </TextMorph>
            </Badge>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setMutedState((m) => !m)}
              aria-label={muted ? 'Turn sounds on' : 'Turn sounds off'}
              aria-pressed={!muted}
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-3 pt-4 pb-1">
            <Knob
              label="Focus length"
              unit="min"
              min={FOCUS.min}
              max={FOCUS.max}
              step={FOCUS.step}
              tickEvery={FOCUS.step}
              fineStep={1}
              onZoom={(zoomed) => (zoomed ? zoomInSound() : zoomOutSound())}
              alt={{
                value: breakMinutes,
                ...BREAK,
                label: 'Break',
                format: (v) => (v === 0 ? 'Off' : clock(v * 60_000)),
                mark: (v) => (v === 0 ? 'off' : String(v)),
                onChange: setBreak,
              }}
              onAltMode={() => switchSound()}
              value={focusMinutes}
              display={clock(left)}
              caption={caption}
              progress={
                phase === 'idle'
                  ? undefined
                  : segment === 'focus'
                    ? Math.max(0, (left / 60_000 - FOCUS.min) / (FOCUS.max - FOCUS.min))
                    : Math.max(0, left / 60_000 / BREAK.max)
              }
              onChange={setLength}
              disabled={phase === 'running'}
            />
            {/* Fixed height, so the layout doesn't jump when "Paused" appears. */}
            <TextMorph as="p" duration={400} ease={EASE} className="h-6 text-base text-muted-foreground">
              {status}
            </TextMorph>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            className="relative h-12 flex-1 overflow-hidden text-base"
            size="lg"
            aria-label={action}
            aria-description={canReset ? 'Hold for 5 seconds to reset' : undefined}
            // Pointer: a short press is a click; holding resets. The click comes after pointer-up,
            // so a long press marks it to be ignored.
            onPointerDown={(e) => e.button === 0 && beginHold()}
            onPointerUp={() => {
              if (hold.current.since && endHold()) hold.current.long = true
            }}
            onPointerLeave={() => hold.current.since && endHold()}
            onPointerCancel={() => hold.current.since && endHold()}
            onClick={(e) => {
              // Keyboard presses are handled in onKeyUp; this is for the pointer.
              if (e.detail === 0) return
              if (hold.current.long) return void (hold.current.long = false)
              primary()
            }}
            onKeyDown={(e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return
              e.preventDefault()
              if (!e.repeat) beginHold()
            }}
            onKeyUp={(e) => {
              if (e.key !== ' ' && e.key !== 'Enter') return
              e.preventDefault()
              if (!hold.current.since || !endHold()) primary()
            }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 origin-left bg-red-500/85 transition-transform',
                holding ? 'scale-x-100 duration-[5000ms] ease-linear' : 'scale-x-0 duration-200 ease-out',
              )}
            />
            <TextMorph duration={350} ease={EASE} className="relative">
              {action}
            </TextMorph>
          </Button>
        </CardFooter>
      </Card>
      <Settings background={background} onBackground={setBackground} sessions={sessions} onSessions={setSessions} />
    </main>
  )
}
