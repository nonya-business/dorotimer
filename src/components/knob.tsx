import { useEffect, useRef, useState } from 'react'
import { TextMorph } from 'torph/react'
import { cn } from '@/lib/utils'

// The dial covers 270°, leaving a gap at the bottom. Angles count clockwise from 12 o'clock.
const START = -135
const SWEEP = 270
const END = START + SWEEP
const R = 38
const BAND = 5
// Bulge: how much the band swells at the handle, and how far along the arc it spreads (degrees).
const BULGE = 4.5
const BULGE_SPREAD = 14
// Stretch: how far (degrees) the whole dial can be pulled past an end, and how much thinner it
// gets at that point.
const STRETCH_MAX = 30
const STRETCH_THIN = 0.22
// Slipping this many degrees past an end doesn't count as a pull: no stretch, and holding there
// still zooms. (At the lowest value the handle sits right at the start, under the finger.)
const PULL_DEADBAND = 8
// Zoom: hold the pointer still this long to zoom in; moving further than HOLD_SLOP px restarts it.
const HOLD_MS = 350
const HOLD_SLOP = 5
// The second setting: pull at least ALT_PULL degrees past the start, into the gap, and hold there
// this long to switch to it.
const ALT_HOLD_MS = 450
const ALT_PULL = 15

/** Sigmoid easing for the pull: follows the pointer at first, then levels off towards `max`. */
function decay(value: number, max: number) {
  const sigmoid = 2 * (1 / (1 + Math.exp(-value / max)) - 0.5)
  return sigmoid * max
}

type KnobProps = {
  value: number
  min: number
  max: number
  step?: number
  /**
   * The finer step available by holding the pointer still (zooming in) or with Shift + arrow keys.
   * Leave out, or equal to `step`, for no zoom.
   */
  fineStep?: number
  /** How many units the dial shows when zoomed in. */
  zoomSpan?: number
  /** Called when the dial zooms in (true) or back out (false). */
  onZoom?: (zoomed: boolean) => void
  /** Draw a tick every this many units. */
  tickEvery?: number
  /** Zoomed in, number the window every this many units (as well as its ends). */
  labelEvery?: number
  unit?: string
  label: string
  /** Text in the middle instead of the value, such as a countdown. */
  display?: string
  /** Fill the arc to this fraction (0-1) instead of the value, and hide the handle. */
  progress?: number
  /** A small line under the middle text. */
  caption?: string
  /**
   * A second setting on the same dial (the break): pull the handle past the start and hold, and
   * the dial switches to it until the pointer is let go. Keyboard: B switches.
   */
  alt?: {
    value: number
    min: number
    max: number
    step: number
    label: string
    /** The middle text for a value, such as "05:00" or "Off". */
    format: (v: number) => string
    /** The number around the dial for a value. */
    mark: (v: number) => string
    onChange: (v: number) => void
  }
  /** Called when the dial switches to the second setting (true) or back (false). */
  onAltMode?: (on: boolean) => void
  disabled?: boolean
  onChange: (value: number) => void
  className?: string
}

function point(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return [50 + r * Math.sin(rad), 50 - r * Math.cos(rad)] as const
}

/** An arc-shaped band from angle a to b whose thickness can change along the way, with round ends. */
function band(a: number, b: number, width: (deg: number) => number) {
  if (b - a < 0.05) return ''
  const n = Math.max(2, Math.ceil((b - a) / 1.5))
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= n; i++) {
    const deg = a + ((b - a) * i) / n
    const half = width(deg) / 2
    outer.push(point(R + half, deg).join(' '))
    inner.push(point(R - half, deg).join(' '))
  }
  const ha = width(a) / 2
  const hb = width(b) / 2
  return (
    `M ${outer.join(' L ')} A ${hb} ${hb} 0 0 1 ${inner[n]} ` +
    `L ${inner.reverse().join(' L ')} A ${ha} ${ha} 0 0 1 ${outer[0]} Z`
  )
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A value that follows its target like a spring: it overshoots a little and settles. */
function useSpring(target: number, stiffness = 420, damping = 18) {
  const [value, setValue] = useState(target)
  const state = useRef({ x: target, v: 0, raf: 0 })

  useEffect(() => {
    const s = state.current
    cancelAnimationFrame(s.raf)
    if (reducedMotion()) {
      s.x = target
      s.v = 0
      setValue(target)
      return
    }
    // Time is measured between this spring's own frames only, and never runs backwards: a frame's
    // timestamp can be earlier than the moment this effect ran.
    let last = -1
    const step = (now: number) => {
      const dt = last < 0 ? 1 / 60 : Math.min(0.032, Math.max(0, (now - last) / 1000))
      last = now
      s.v += (stiffness * (target - s.x) - damping * s.v) * dt
      s.x += s.v * dt
      if (Math.abs(target - s.x) < 0.002 && Math.abs(s.v) < 0.02) {
        s.x = target
        s.v = 0
        setValue(target)
        return
      }
      setValue(s.x)
      s.raf = requestAnimationFrame(step)
    }
    s.raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(s.raf)
  }, [target, stiffness, damping])

  return value
}

/**
 * The middle text. A clock like "14:59" morphs as two numbers around a fixed colon: Torph rolls a
 * number by place value, so only the digits that change move, but it only treats a word as a
 * number when it's digits and number separators, and a colon isn't one.
 */
function Display({ text, disabled }: { text: string; disabled: boolean }) {
  const morph = { disabled, duration: 300, ease: 'cubic-bezier(0.19, 1, 0.22, 1)' }
  const clock = /^(\d+):(\d{2})$/.exec(text)
  // Same-width (tabular) figures, so a ticking countdown never shifts sideways.
  const type = 'font-heading text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl'
  if (!clock) return <TextMorph {...morph} className={type}>{text}</TextMorph>
  return (
    <div className={cn('flex items-baseline', type)}>
      <TextMorph {...morph}>{clock[1]}</TextMorph>
      <span>:</span>
      <TextMorph {...morph}>{clock[2]}</TextMorph>
    </div>
  )
}

export function Knob({
  value,
  min,
  max,
  step = 1,
  fineStep = step,
  zoomSpan = 20,
  onZoom,
  tickEvery = 5,
  labelEvery = 5,
  unit,
  label,
  display,
  progress,
  caption,
  alt,
  onAltMode,
  disabled,
  onChange,
  className,
}: KnobProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  // How far the pointer has been pulled past an end, in degrees: positive past the top, negative past the bottom.
  const [pull, setPullState] = useState(0)
  // Pointer events can arrive faster than React re-renders, so the drag logic reads refs.
  const pullRef = useRef(0)
  const setPull = (deg: number) => {
    pullRef.current = deg
    setPullState(deg)
  }
  // A short elastic kick when the keys or the wheel push against an end.
  const [bump, setBump] = useState(0)
  const bumpTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Where the pointer is, as an angle that keeps counting past ±180°, so a drag can be measured
  // by how far it turned (zoomed in, and on the second setting) rather than where it points.
  const turn = useRef({ raw: 0, total: 0 })

  // Zoom: holding the pointer still shows a narrower window of the range, with a bar for every
  // fine step, and dragging then picks fine steps. Letting go zooms back out.
  type Zoom = { lo: number; hi: number; from: number; at: number }
  const canZoom = fineStep < step
  const [zoom, setZoomState] = useState<Zoom | null>(null)
  const zoomRef = useRef<Zoom | null>(null)
  const lastZoom = useRef<Zoom>({ lo: min, hi: max, from: value, at: 0 }) // kept while zooming back out
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number }>({ x: 0, y: 0 })
  const setZoom = (z: Zoom | null) => {
    if (!!z !== !!zoomRef.current) onZoom?.(!!z)
    zoomRef.current = z
    if (z) lastZoom.current = z
    setZoomState(z)
  }

  // The second setting (the break). `onDial`: whether the pointer has come back onto the dial since
  // the switch; until then it is still in the gap, and nothing changes.
  type AltMode = { onDial: boolean }
  const [altMode, setAltModeState] = useState(false)
  const altRef = useRef<AltMode | null>(null)
  const altTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dragFrom = useRef(value) // the value when the drag began, put back on switching
  const setAltMode = (a: AltMode | null) => {
    if (!!a !== !!altRef.current) onAltMode?.(!!a)
    altRef.current = a
    setAltModeState(!!a)
  }

  // The displayed text switches instantly while the value changes quickly (dragging, wheel, held
  // key): morphs that start before the last one has finished overlap into unreadable digits.
  const shown = altMode && alt ? alt.value : value
  const [scrubbing, setScrubbing] = useState(false)
  const scrubTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastShown = useRef(shown)
  const lastChange = useRef(0)
  useEffect(() => {
    if (lastShown.current === shown) return
    lastShown.current = shown
    const now = performance.now()
    // A single step still morphs; only a second change hard on its heels counts as scrubbing.
    if (now - lastChange.current < 350) setScrubbing(true)
    lastChange.current = now
    clearTimeout(scrubTimer.current)
    scrubTimer.current = setTimeout(() => setScrubbing(false), 350)
  }, [shown])

  const showHandle = progress === undefined
  const zoomAmount = useSpring(zoom && showHandle ? 1 : 0, 240, 26)
  // 0 on the main setting, 1 on the second: everything on the dial blends between the two.
  const altAmount = useSpring(altMode ? 1 : 0, 260, 26)
  const win = zoom ?? lastZoom.current
  const viewLo = min + (win.lo - min) * zoomAmount
  const viewHi = max + (win.hi - max) * zoomAmount
  /** Where a value sits on the dial in the current (possibly zoomed) view. */
  const toDeg = (v: number) => START + ((v - viewLo) / (viewHi - viewLo)) * SWEEP
  const altDeg = alt ? START + ((alt.value - alt.min) / (alt.max - alt.min)) * SWEEP : START

  // Rubber band: while pulled, the stretch follows the pointer closely; let go, and it springs
  // back with a bounce.
  const pullTarget = Math.sign(pull) * decay(Math.max(0, Math.abs(pull) - PULL_DEADBAND), STRETCH_MAX)
  const held = pull !== 0
  const stretch = useSpring(showHandle ? pullTarget + bump : 0, held ? 1400 : 380, held ? 60 : 11)
  const amp = useSpring(!showHandle ? 0 : dragging ? 1 : hover || focused ? 0.6 : 0.3, 300, 20)

  // Pulled past an end, the whole dial stretches like a rubber band, anchored at the other end:
  // every angle moves away from that anchor by the same factor, so the arc gets longer and the
  // handle rides out at its tip. Ticks stay put as the fixed scale. A negative stretch (the bounce
  // back) briefly squeezes it instead.
  const atMax = value === max
  const anchor = atMax ? START : END
  const factor = showHandle && !altMode && (atMax || value === min) ? 1 + (atMax ? stretch : -stretch) / SWEEP : 1
  const along = (deg: number) => anchor + (deg - anchor) * factor
  const valueDeg = Math.min(END, Math.max(START, toDeg(value)))
  const mainDeg = progress === undefined ? valueDeg : START + progress * SWEEP
  const fillDeg = along(mainDeg + (altDeg - mainDeg) * altAmount)
  const handleDeg = fillDeg
  const s = Math.min(1, Math.abs(factor - 1) / (STRETCH_MAX / SWEEP))

  function kick(direction: 1 | -1) {
    clearTimeout(bumpTimer.current)
    setBump(direction * 7)
    bumpTimer.current = setTimeout(() => setBump(0), 90)
  }

  /** Set a value, rounded to `grain` and kept within the range. */
  const set = (v: number, grain = step) => {
    const current = latest.current.value
    const next = Math.min(max, Math.max(min, Math.round(v / grain) * grain))
    if (v > max && current === max) kick(1)
    if (v < min && current === min) kick(-1)
    if (next !== current) {
      // Record it now: the next pointer event may come before the re-render does.
      latest.current.value = next
      onChange(next)
    }
  }
  /** Set the second setting, rounded to its step and kept within its range. */
  const setAlt = (v: number) => {
    if (!alt) return
    const current = latest.current.alt
    const next = Math.min(alt.max, Math.max(alt.min, Math.round(v / alt.step) * alt.step))
    if (next !== current) {
      latest.current.alt = next
      alt.onChange(next)
    }
  }
  /** One step up or down from the value, landing on the step grid (27 goes up to 30, down to 20). */
  const stepFrom = (v: number, dir: 1 | -1, grain: number) =>
    dir > 0 ? Math.floor(v / grain) * grain + grain : Math.ceil(v / grain) * grain - grain
  const noop = () => {}
  const latest = useRef<{ set: (v: number, grain?: number) => void; setAlt: (v: number) => void; value: number; alt: number; disabled?: boolean }>({
    set: noop,
    setAlt: noop,
    value,
    alt: alt?.value ?? 0,
    disabled,
  })
  latest.current.value = value
  latest.current.alt = alt?.value ?? 0
  latest.current.disabled = disabled

  function switchToAlt() {
    if (!alt || altRef.current) return
    clearTimeout(hold.current.timer)
    clearTimeout(altTimer.current)
    // Pulling down to get here set the main value to its minimum: put back what it was.
    set(dragFrom.current, fineStep)
    setPull(0)
    setZoom(null)
    setAltMode({ onDial: false })
  }

  function fromPointer(e: React.PointerEvent) {
    const box = ref.current!.getBoundingClientRect()
    const dx = e.clientX - (box.left + box.width / 2)
    const dy = e.clientY - (box.top + box.height / 2)
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    let d = deg - turn.current.raw
    if (d > 180) d -= 360
    if (d < -180) d += 360
    turn.current = { raw: deg, total: turn.current.total + d }

    // On the second setting the handle sits under the pointer. The switch happens with the pointer
    // in the gap, so nothing changes until it comes back onto the dial; after that, the gap holds
    // the nearer end.
    const a = altRef.current
    if (a && alt) {
      if (deg >= START && deg <= END) {
        a.onDial = true
        return setAlt(alt.min + ((deg - START) / SWEEP) * (alt.max - alt.min))
      }
      if (a.onDial) setAlt(deg > END ? alt.max : alt.min)
      return
    }
    // Zoomed in, the value follows how far the pointer has turned since the zoom, so nothing
    // jumps at the switch.
    const z = zoomRef.current
    if (z) {
      const v = z.from + ((turn.current.total - z.at) / SWEEP) * (z.hi - z.lo)
      return set(Math.min(z.hi, Math.max(z.lo, v)), fineStep)
    }

    const { value } = latest.current
    const pull = pullRef.current
    const t = (value - min) / (max - min)
    const pastTop = (deg - END + 360) % 360
    const pastBottom = (START - deg + 360) % 360
    // Already pulling past an end: keep pulling from that end, even across the gap, until the
    // pointer comes back inside the dial on that end's side.
    if (pull > 0 && (deg > END || deg < 0)) setPull(pastTop)
    else if (pull < 0 && (deg < START || deg > 0)) setPull(-pastBottom)
    else if (deg > END || deg < START) {
      // Entering the gap: stretch from whichever end the value is at.
      if (t > 0.5) {
        set(max)
        setPull(pastTop)
      } else {
        set(min)
        setPull(-pastBottom)
      }
    } else {
      setPull(0)
      set(min + ((deg - START) / SWEEP) * (max - min))
    }

    // Pulled well past the start and held there, the dial switches to the second setting.
    if (alt && pullRef.current <= -ALT_PULL) {
      if (!altTimer.current) altTimer.current = setTimeout(switchToAlt, ALT_HOLD_MS)
    } else {
      clearTimeout(altTimer.current)
      altTimer.current = undefined
    }
  }

  latest.current.set = set
  latest.current.setAlt = setAlt

  /** Start (or restart) the hold timer: if the pointer stays put for HOLD_MS, zoom in. */
  function armHold(x: number, y: number) {
    clearTimeout(hold.current.timer)
    hold.current = { x, y }
    if (!canZoom || zoomRef.current || altRef.current) return
    hold.current.timer = setTimeout(() => {
      // Not while really pulled past an end: holding there is for the second setting.
      if (Math.abs(pullRef.current) >= PULL_DEADBAND || altRef.current) return
      const c = latest.current.value
      const span = Math.min(zoomSpan, max - min)
      // Lay the window out so the value stays exactly where the handle already is, and the
      // finer bars spread out from under the pointer.
      // Whole fine steps at the ends, so its numbers never show fractions.
      const where = (c - min) / (max - min)
      const lo = Math.min(max - span, Math.max(min, Math.round((c - where * span) / fineStep) * fineStep))
      setZoom({ lo, hi: lo + span, from: c, at: turn.current.total })
    }, HOLD_MS)
  }

  function release() {
    clearTimeout(hold.current.timer)
    clearTimeout(altTimer.current)
    altTimer.current = undefined
    setDragging(false)
    setPull(0)
    if (zoomRef.current) setZoom(null)
    if (altRef.current) setAltMode(null)
  }

  // Scroll to turn: a step at a time, a fine step with Shift. React's own wheel listener is
  // passive and can't stop the page scrolling.
  useEffect(() => {
    const el = ref.current!
    const onWheel = (e: WheelEvent) => {
      if (latest.current.disabled) return
      e.preventDefault()
      const k = latest.current
      const dir = e.deltaY < 0 ? 1 : -1
      if (altRef.current && alt) return k.setAlt(k.alt + dir * alt.step)
      const grain = e.shiftKey ? fineStep : step
      k.set(stepFrom(k.value, dir, grain), grain)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [step, fineStep, alt])

  function onKeyDown(e: React.KeyboardEvent) {
    // B switches between the two settings; Enter and Escape go back to the main one.
    if (alt && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault()
      if (altRef.current) setAltMode(null)
      else setAltMode({ onDial: true })
      return
    }
    if (altRef.current && alt) {
      if (e.key === 'Enter' || e.key === 'Escape') return void (e.preventDefault(), setAltMode(null))
      const a = latest.current.alt
      const moves: Record<string, number> = {
        ArrowUp: a + alt.step,
        ArrowRight: a + alt.step,
        ArrowDown: a - alt.step,
        ArrowLeft: a - alt.step,
        Home: alt.min,
        End: alt.max,
      }
      if (!(e.key in moves)) return
      e.preventDefault()
      return setAlt(moves[e.key])
    }
    const { value } = latest.current
    const grain = e.shiftKey ? fineStep : step
    const moves: Record<string, number> = {
      ArrowUp: stepFrom(value, 1, grain),
      ArrowRight: stepFrom(value, 1, grain),
      ArrowDown: stepFrom(value, -1, grain),
      ArrowLeft: stepFrom(value, -1, grain),
      PageUp: stepFrom(value, 1, grain) + grain * 2,
      PageDown: stepFrom(value, -1, grain) - grain * 2,
      Home: min,
      End: max,
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    set(moves[e.key], grain)
  }

  // How strongly a point on the dial is under the handle's bulge (1 at the handle, fading out).
  const near = (deg: number) => Math.exp(-((deg - handleDeg) ** 2) / (2 * BULGE_SPREAD ** 2))

  const trackStart = along(START)
  const trackEnd = along(END)
  const width = (deg: number, bulge = true) => {
    const w = BAND + (bulge ? BULGE * amp * near(deg) : 0)
    // Stretched thinner, like the rubber band it is.
    return w * (1 - STRETCH_THIN * s)
  }

  const tick = (key: string, deg: number, opacity: number, main: boolean, lit: boolean) => {
    const lift = amp * near(deg)
    // Pushed outward near the handle, so they stay clear of it when it swells.
    const [x1, y1] = point(45 + 3.4 * lift, deg)
    const [x2, y2] = point((main ? 48 : 47) + 5 * lift, deg)
    return (
      <line
        key={key}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        opacity={opacity}
        strokeWidth={(main ? 1 : 0.7) + 0.6 * lift}
        strokeLinecap="round"
        className={cn('transition-colors', lit ? 'stroke-foreground/60' : 'stroke-foreground/15')}
      />
    )
  }
  const mark = (key: string, deg: number, opacity: number, lit: boolean, text: string) => {
    const [x, y] = point(57, deg)
    return (
      <text
        key={key}
        x={x}
        y={y}
        opacity={opacity}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn('font-mono text-[3.4px] tabular-nums', lit ? 'fill-foreground/70' : 'fill-foreground/35')}
      >
        {text}
      </text>
    )
  }

  // The main setting's bars: the main ones (every tickEvery), plus one per fine step that fades
  // in as the dial zooms. They fade out as the dial switches to the second setting.
  const ticks = []
  const fine = zoomAmount > 0.01 ? fineStep : tickEvery
  if (altAmount < 0.99) {
    for (let v = Math.ceil(viewLo / fine) * fine; v <= viewHi + 1e-9; v += fine) {
      const main = Math.abs(v / tickEvery - Math.round(v / tickEvery)) < 1e-9
      const deg = toDeg(v)
      if (deg < START - 0.5 || deg > END + 0.5) continue
      ticks.push(tick(`m${v}`, deg, (main ? 1 : zoomAmount) * (1 - altAmount), main, v <= value))
    }
  }
  // Zoomed in, numbers mark the window: its two ends and every labelEvery in between, so it's
  // plain that the scale has changed and to what. They fade in with the zoom, and slide back out
  // along with the bars when it zooms out.
  const labels = []
  if (zoomAmount > 0.01 && altAmount < 0.99) {
    const marks = new Set([win.lo, win.hi])
    for (let v = Math.ceil(win.lo / labelEvery) * labelEvery; v <= win.hi; v += labelEvery) marks.add(v)
    for (const v of marks) {
      const deg = toDeg(v)
      if (deg < START - 0.5 || deg > END + 0.5) continue
      labels.push(mark(`z${v}`, deg, zoomAmount * (1 - altAmount), v <= value, String(v)))
    }
  }
  // The second setting has its own bars and numbers, faded in as the dial switches to it.
  if (alt && altAmount > 0.01) {
    for (let v = alt.min; v <= alt.max; v += alt.step) {
      const deg = START + ((v - alt.min) / (alt.max - alt.min)) * SWEEP
      ticks.push(tick(`a${v}`, deg, altAmount, true, v <= alt.value))
      labels.push(mark(`a${v}`, deg, altAmount, v <= alt.value, alt.mark(v)))
    }
  }

  const [hx, hy] = point(R, handleDeg)
  const handleR = 5 + 1.4 * amp
  const onAlt = altMode && alt

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={onAlt ? alt.label : label}
      aria-valuemin={onAlt ? alt.min : min}
      aria-valuemax={onAlt ? alt.max : max}
      aria-valuenow={onAlt ? alt.value : value}
      aria-valuetext={onAlt ? alt.format(alt.value) : unit ? `${value} ${unit}` : String(value)}
      aria-disabled={disabled || undefined}
      onKeyDown={disabled ? undefined : onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (altRef.current && !dragging) setAltMode(null)
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
        pullRef.current = 0
        dragFrom.current = latest.current.value
        const box = ref.current!.getBoundingClientRect()
        const deg = (Math.atan2(e.clientX - (box.left + box.width / 2), -(e.clientY - (box.top + box.height / 2))) * 180) / Math.PI
        turn.current = { raw: deg, total: deg }
        armHold(e.clientX, e.clientY)
        fromPointer(e)
      }}
      onPointerMove={(e) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return
        // Moving restarts the hold: pausing anywhere during a drag zooms in too.
        if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_SLOP) armHold(e.clientX, e.clientY)
        fromPointer(e)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      className={cn(
        'relative aspect-square w-full max-w-80 touch-none rounded-full outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="size-full overflow-visible" aria-hidden="true">
        {ticks}
        {/* Only the filled side bulges; the track stays even. */}
        <path d={band(trackStart, trackEnd, (deg) => width(deg, false))} className="fill-muted" />
        <path d={band(trackStart, fillDeg, width)} className="fill-primary" />
        {labels}
        {showHandle && (
          <>
            <circle cx={hx} cy={hy} r={handleR * (1 - 0.1 * s)} strokeWidth={2} className="fill-background stroke-primary" />
            {/* Zoomed in, the ring fills in solid: the other sign of single-minute mode. */}
            <circle cx={hx} cy={hy} r={handleR * (1 - 0.1 * s)} opacity={zoomAmount} className="fill-primary" />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Display text={onAlt ? alt.format(alt.value) : (display ?? String(value))} disabled={scrubbing || dragging} />
        <TextMorph as="span" duration={300} className="h-4 font-mono text-xs tracking-wide text-muted-foreground">
          {onAlt ? alt.label : (caption ?? (unit && !display ? unit : ''))}
        </TextMorph>
      </div>
    </div>
  )
}
