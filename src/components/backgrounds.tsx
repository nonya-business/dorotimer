import { useEffect, useRef } from 'react'
import { MAX_MINUTES, type Session } from '@/lib/sessions'

// Reset sessions: one flat, muted orange in both backgrounds.
const ORANGE = { dark: '#a8704a', light: '#c78b62' }

const isDark = () => document.documentElement.classList.contains('dark')

/** 0 for a 1-minute session, 1 for the longest. */
const strength = (s: Session) => Math.min(1, Math.max(0, (s.minutes - 1) / (MAX_MINUTES - 1)))

/** A grey of perceived lightness `l` (0 black, 1 white), as a CSS colour. */
function grey(l: number) {
  const lin = l ** 3 // perceptual lightness to linear light (the OKLab curve)
  const v = lin <= 0.0031308 ? 12.92 * lin : 1.055 * lin ** (1 / 2.4) - 0.055
  const c = Math.round(Math.min(1, Math.max(0, v)) * 255)
  return `rgb(${c} ${c} ${c})`
}

/**
 * A canvas covering the whole window behind the timer, sized for sharp lines on Retina screens.
 * `draw` runs again when the window is resized, the theme changes or `deps` change.
 */
function useBackdrop(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    let frame = 0
    const render = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const w = window.innerWidth
        const h = window.innerHeight
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        draw(ctx, w, h)
      })
    }
    render()
    window.addEventListener('resize', render)
    const theme = new MutationObserver(render)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', render)
      theme.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 size-full" />
}

const CELL = 10
const GAP = 3

/**
 * Every session is a square, filled like text from the top left, oldest first. Its shade is its
 * length: 1 minute almost the background, 90 minutes white (black in light mode). Reset sessions
 * are orange. Places without a session aren't drawn. When there are more sessions than squares, the
 * oldest ones drop off.
 */
export function GridBackground({ sessions }: { sessions: Session[] }) {
  return useBackdrop(
    (ctx, w, h) => {
      const dark = isDark()
      const pitch = CELL + GAP
      const cols = Math.floor((w - GAP) / pitch)
      const rows = Math.floor((h - GAP) / pitch)
      const left = (w - (cols * pitch - GAP)) / 2
      const top = (h - (rows * pitch - GAP)) / 2
      const shown = sessions.slice(-cols * rows)
      for (let i = 0; i < cols * rows; i++) {
        const s = shown[i]
        const x = left + (i % cols) * pitch
        const y = top + Math.floor(i / cols) * pitch
        // Only sessions are drawn; empty places stay invisible.
        if (!s) continue
        ctx.beginPath()
        ctx.fillStyle = !s.completed
          ? dark
            ? ORANGE.dark
            : ORANGE.light
          : grey(dark ? 0.24 + 0.76 * strength(s) : 0.9 - 0.75 * strength(s))
        ctx.roundRect(x, y, CELL, CELL, 2)
        ctx.fill()
      }
    },
    [sessions],
  )
}

const RES = 6 // px between height samples
const LEVELS = 16 // contour lines from the lowest ground to the highest peak
const MIN_STEP = 0.12 // so a few small hills still get a few rings, not sixteen

/**
 * Every session raises a hill; longer sessions raise wider, higher ones. The sessions of one day
 * build one mountain together, spiralling out from that day's spot, and every day gets its own
 * spot, spread evenly over the window (a low-discrepancy sequence). So busy days become peaks and
 * the landscape grows a day at a time. Contour lines run through the summed height, always about
 * LEVELS of them however high it gets; higher lines are brighter. Where a reset session's hill
 * dominates, its lines are orange.
 */
export function TopographyBackground({ sessions }: { sessions: Session[] }) {
  return useBackdrop(
    (ctx, w, h) => {
      const dark = isDark()
      const cols = Math.ceil(w / RES) + 1
      const rows = Math.ceil(h / RES) + 1
      const height = new Float32Array(cols * rows)
      const top = new Float32Array(cols * rows) // strongest single hill at each point
      const owner = new Int32Array(cols * rows).fill(-1) // which session that hill belongs to
      const scale = Math.sqrt(w * h) / 1000
      const days = new Map<string, { index: number; count: number }>()

      sessions.forEach((s, i) => {
        const t = strength(s)
        const d = new Date(s.at)
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        let day = days.get(key)
        if (!day) days.set(key, (day = { index: days.size, count: 0 }))
        const nth = day.count++
        // The day's spot, from the R2 sequence: successive points spread evenly without a grid.
        // Spots run a little past the window, so the terrain carries on beyond its edges. The sequence
        // starts off centre, so the first day's mountain isn't hidden behind the timer.
        const dayX = (-0.08 + 1.16 * ((0.18 + day.index * 0.7548776662) % 1)) * w
        const dayY = (-0.08 + 1.16 * ((0.18 + day.index * 0.569840291) % 1)) * h
        // Within the day, sessions spiral outward (golden angle), so the mountain grows round.
        const spiral = 16 * Math.sqrt(nth) * scale
        const cx = dayX + spiral * Math.cos(nth * 2.39996)
        const cy = dayY + spiral * Math.sin(nth * 2.39996)
        const sigma = (20 + 34 * Math.sqrt(t)) * scale
        const amp = 0.3 + 0.7 * t
        const reach = sigma * 3
        const x0 = Math.max(0, Math.floor((cx - reach) / RES))
        const x1 = Math.min(cols - 1, Math.ceil((cx + reach) / RES))
        const y0 = Math.max(0, Math.floor((cy - reach) / RES))
        const y1 = Math.min(rows - 1, Math.ceil((cy + reach) / RES))
        const k = -1 / (2 * sigma * sigma)
        for (let y = y0; y <= y1; y++) {
          const dy = y * RES - cy
          for (let x = x0; x <= x1; x++) {
            const dx = x * RES - cx
            const v = amp * Math.exp((dx * dx + dy * dy) * k)
            const j = y * cols + x
            height[j] += v
            if (v > top[j]) {
              top[j] = v
              owner[j] = i
            }
          }
        }
      })

      let peak = 0
      for (const v of height) peak = Math.max(peak, v)
      const STEP = Math.max(MIN_STEP, peak / (LEVELS + 1))
      const levels = Math.floor(peak / STEP)
      if (levels < 1) return

      // Marching squares: for every cell and every contour level it spans, one or two line pieces.
      // Pieces are grouped by colour and brightness band so they're drawn in a few strokes.
      const BANDS = 6
      const paths = new Map<string, Path2D>()
      const pathFor = (orange: boolean, level: number) => {
        const band = Math.min(BANDS - 1, Math.floor(((level - 1) / Math.max(1, levels)) * BANDS))
        const key = `${orange ? 1 : 0}-${band}`
        let p = paths.get(key)
        if (!p) paths.set(key, (p = new Path2D()))
        return p
      }
      const lerp = (a: number, b: number, level: number) => (level - a) / (b - a)

      for (let y = 0; y < rows - 1; y++) {
        for (let x = 0; x < cols - 1; x++) {
          const j = y * cols + x
          const a = height[j] // top left
          const b = height[j + 1] // top right
          const c = height[j + cols + 1] // bottom right
          const d = height[j + cols] // bottom left
          const lo = Math.min(a, b, c, d)
          const hi = Math.max(a, b, c, d)
          const first = Math.max(1, Math.ceil(lo / STEP))
          const last = Math.floor(hi / STEP)
          if (first > last) continue
          const o = owner[j]
          const orange = o >= 0 && !sessions[o].completed
          const px = x * RES
          const py = y * RES
          for (let n = first; n <= last; n++) {
            const L = n * STEP
            const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0)
            if (idx === 0 || idx === 15) continue
            const T: [number, number] = [px + RES * lerp(a, b, L), py]
            const R: [number, number] = [px + RES, py + RES * lerp(b, c, L)]
            const B: [number, number] = [px + RES * lerp(d, c, L), py + RES]
            const Lf: [number, number] = [px, py + RES * lerp(a, d, L)]
            const segs: [number, number][][] = {
              1: [[Lf, B]], 2: [[B, R]], 3: [[Lf, R]], 4: [[T, R]], 5: [[Lf, T], [B, R]], 6: [[T, B]],
              7: [[Lf, T]], 8: [[Lf, T]], 9: [[T, B]], 10: [[Lf, B], [T, R]], 11: [[T, R]], 12: [[Lf, R]],
              13: [[B, R]], 14: [[Lf, B]],
            }[idx] as [number, number][][]
            const p = pathFor(orange, n)
            for (const [p0, p1] of segs) {
              p.moveTo(p0[0], p0[1])
              p.lineTo(p1[0], p1[1])
            }
          }
        }
      }

      ctx.lineWidth = 1
      ctx.lineCap = 'round'
      for (const [key, p] of paths) {
        const [orange, band] = key.split('-').map(Number)
        const alpha = 0.07 + (0.3 * (band + 1)) / BANDS
        ctx.strokeStyle = orange
          ? `${dark ? ORANGE.dark : ORANGE.light}${Math.round(Math.min(1, 0.3 + alpha * 1.6) * 255).toString(16).padStart(2, '0')}`
          : dark
            ? `rgb(255 255 255 / ${alpha})`
            : `rgb(0 0 0 / ${alpha})`
        ctx.stroke(p)
      }
    },
    [sessions],
  )
}
