// UI sounds from SND01 "sine" (snd.dev, Dentsu Lab Tokyo), in public/sounds/, plus one made in
// code: the Focus/Break switch (see makeSwitch).
// To swap a sound, point its entry below at another file there, or drop in your own .wav or .mp3.
// Browsers only allow audio after a click or key press, so the files are loaded and the audio
// context started from those events (see unlockSound).

const SOUNDS = {
  // Knob steps rotate through five slightly different taps, so fast turns don't sound mechanical.
  tap: ['tap_01', 'tap_02', 'tap_03', 'tap_04', 'tap_05'],
  start: ['toggle_on'],
  pause: ['toggle_off'],
  // Generated, not a file: a soft plastic clack.
  switch: ['switch'],
  button: ['button'],
  // Holding the knob zooms it in for single minutes, letting go zooms back out.
  zoomIn: ['transition_up'],
  zoomOut: ['transition_down'],
  focusDone: ['celebration'],
  breakDone: ['notification'],
} satisfies Record<string, string[]>

// Volume per sound, 0 to 1. Lower the tap to make the knob quieter.
const VOLUME: Record<keyof typeof SOUNDS, number> = {
  tap: 0.25,
  start: 0.8,
  pause: 0.8,
  switch: 0.16,
  button: 0.6,
  zoomIn: 0.3,
  zoomOut: 0.25,
  focusDone: 1,
  breakDone: 1,
}

let ctx: AudioContext | null = null

// Chrome refuses (and logs an error for) vibration before the first tap on the page.
const vibrate = (pattern: number | number[]) => {
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pattern)
}
const buffers = new Map<string, AudioBuffer>()
let muted = false
let lastTap = 0
let tapIndex = 0

// Download the files right away; decoding has to wait for the audio context.
const GENERATED = new Set(['switch'])

const files = new Map(
  Object.values(SOUNDS)
    .flat()
    .filter((name) => !GENERATED.has(name))
    .map((name) => {
      const data = fetch(`/sounds/${name}.wav`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null)
      return [name, data] as const
    }),
)

async function decode(ac: AudioContext, name: string, data: Promise<ArrayBuffer | null>) {
  const bytes = await data
  if (!bytes) return
  try {
    buffers.set(name, await ac.decodeAudioData(bytes))
  } catch {
    // A missing or broken file just stays silent.
  }
}

/**
 * The Focus/Break switch: a soft plastic clack, like a key bottoming out. A tiny latch tick, then
 * 16 ms later the "clack": a few short resonances of a hollow plastic body (1.15, 1.85 and 3.1 kHz)
 * over a puff of noise. A gentle low-pass at 4 kHz takes the hard edge off. The noise uses a
 * fixed seed, so the sound is the same every time.
 */
function makeSwitch(ac: BaseAudioContext) {
  const rate = ac.sampleRate
  const buffer = ac.createBuffer(1, Math.round(rate * 0.06), rate)
  const data = buffer.getChannelData(0)
  let seed = 7
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  // One hit: decaying sine resonances [frequency, decay time, level] plus a burst of noise.
  const hit = (at: number, level: number, modes: [number, number, number][], noiseDecay: number) => {
    const start = Math.round(at * rate)
    for (let i = 0; start + i < data.length; i++) {
      const t = i / rate
      let v = 0.5 * Math.exp(-t / noiseDecay) * noise()
      for (const [freq, decay, amp] of modes) v += amp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * freq * t)
      data[start + i] += level * v
    }
  }
  hit(0, 0.22, [[2300, 0.0012, 0.6]], 0.0006)
  hit(0.016, 0.5, [[1150, 0.006, 0.7], [1850, 0.0035, 0.4], [3100, 0.0015, 0.2]], 0.0015)
  // Soften: a one-pole low-pass, then scale the loudest point to 0.8.
  const k = 1 - Math.exp((-2 * Math.PI * 4000) / rate)
  let y = 0
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    y += k * (data[i] - y)
    data[i] = y
    peak = Math.max(peak, Math.abs(y))
  }
  for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak
  return buffer
}

/**
 * When a page goes quiet, Safari and macOS power the audio output down, and waking it for each
 * short tap adds a noticeable delay. Keeping it running all the time fixes that, but Safari on
 * macOS pops at random during continuous Web Audio playback (WebKit bugs 249970, 255293).
 * So the output is only kept awake while the page is in use: a signal far below hearing
 * (-80 dB at 20 Hz) holds it open, and the context is suspended again after IDLE_MS of no
 * activity. Mouse movement over the page wakes it ahead of the first knob turn.
 */
const IDLE_MS = 4000
let idleTimer: ReturnType<typeof setTimeout> | undefined

function keepAwake(ac: AudioContext) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.frequency.value = 20
  gain.gain.value = 0.0001
  osc.connect(gain).connect(ac.destination)
  osc.start()
}

/** Wake the audio output (once sound has been unlocked) and keep it awake for IDLE_MS. */
export function wakeSound() {
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (ctx?.state === 'running') void ctx.suspend()
  }, IDLE_MS)
}

export function unlockSound() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    const ac = ctx
    files.forEach((data, name) => void decode(ac, name, data))
    buffers.set('switch', makeSwitch(ac))
    keepAwake(ac)
  }
  wakeSound()
}

export function setMuted(value: boolean) {
  muted = value
}

function play(kind: keyof typeof SOUNDS, file = SOUNDS[kind][0]) {
  const buffer = buffers.get(file)
  if (muted || !ctx || !buffer) return
  const ac = ctx
  wakeSound()
  const start = () => {
    const source = ac.createBufferSource()
    const gain = ac.createGain()
    // Some files jump from silence to full level within a sample or two (tap_01, tap_02,
    // toggle_off) or sit off centre (tap_05). Small laptop speakers turn both into a crack.
    // A short fade at each end and a filter below hearing take those edges off.
    const highpass = new BiquadFilterNode(ac, { type: 'highpass', frequency: 40 })
    const t = ac.currentTime
    const end = t + buffer.duration
    const fadeIn = 0.0003
    const fadeOut = Math.min(0.004, buffer.duration / 4)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(VOLUME[kind], t + fadeIn)
    gain.gain.setValueAtTime(VOLUME[kind], end - fadeOut)
    gain.gain.linearRampToValueAtTime(0, end)
    source.buffer = buffer
    source.connect(highpass).connect(gain).connect(ac.destination)
    source.start(t)
  }
  // Asleep: play as soon as the output is back, a little late rather than not at all.
  if (ac.state === 'running') start()
  else void ac.resume().then(start, () => {})
}

/** A tap for each knob step. */
export function tick() {
  const now = performance.now()
  // Fast spins pass many steps per frame; more than one tap every 18 ms just buzzes.
  if (now - lastTap < 18) return
  lastTap = now
  play('tap', SOUNDS.tap[tapIndex++ % SOUNDS.tap.length])
  vibrate(4)
}

export const startSound = () => play('start')
export const pauseSound = () => play('pause')
export const switchSound = () => play('switch')
export const buttonSound = () => play('button')
export const zoomInSound = () => play('zoomIn')
export const zoomOutSound = () => play('zoomOut')

export function doneSound(mode: 'focus' | 'break') {
  play(mode === 'focus' ? 'focusDone' : 'breakDone')
  vibrate([80, 60, 80])
}
