// BGMマネージャ。public/audio/<key>.mp3 をループ再生。画面遷移で切替、勝利ジングル、ミュート対応。
// 効果音(SFX)は素材ファイル不要のWebAudio合成。
// ブラウザの自動再生制限のため、最初のユーザー操作で unlock() してから鳴らす。
const BASE = import.meta.env.BASE_URL

const readNum = (key: string, def: number): number => {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null || raw === '') return def
    const v = Number(raw)
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : def
  } catch {
    return def
  }
}
const readBool = (key: string, def: boolean): boolean => {
  try {
    const v = localStorage.getItem(key)
    return v == null ? def : v === '1'
  } catch {
    return def
  }
}

let bgm: HTMLAudioElement | null = null
let bgmKey: string | null = null
let unlocked = false
let muted = readBool('ao-muted', false)
let bgmVol = readNum('ao-vol', 0.5)
let sfxOn = readBool('ao-sfx', true)

function ensure(): HTMLAudioElement {
  if (!bgm) {
    bgm = new Audio()
    bgm.loop = true
    bgm.volume = bgmVol
    bgm.preload = 'auto'
  }
  return bgm
}

/** 指定キーのBGMをループ再生(同じキーなら何もしない) */
export function playBgm(key: string): void {
  if (key === bgmKey) return
  bgmKey = key
  const el = ensure()
  el.src = `${BASE}audio/${key}.mp3`
  el.loop = true
  el.volume = bgmVol
  if (!muted && unlocked) el.play().catch(() => {})
}

/** 最初のユーザー操作で呼ぶ。再生を解禁し、保留中のBGMを鳴らす */
export function unlock(): void {
  if (unlocked) return
  unlocked = true
  ensureCtx()
  if (!muted && bgm && bgmKey) bgm.play().catch(() => {})
}

/** 勝利ジングル(一度きり)。BGMを止めて鳴らす。次の playBgm で再開される */
export function playVictory(): void {
  if (bgm) bgm.pause()
  bgmKey = null
  if (muted || !unlocked) return
  const v = new Audio(`${BASE}audio/victory.mp3`)
  v.volume = bgmVol
  v.play().catch(() => {})
}

export function isMuted(): boolean {
  return muted
}

/** ミュート切替。状態を返す */
export function toggleMute(): boolean {
  muted = !muted
  try {
    localStorage.setItem('ao-muted', muted ? '1' : '0')
  } catch {
    /* noop */
  }
  if (bgm) {
    if (muted) bgm.pause()
    else if (unlocked) bgm.play().catch(() => {})
  }
  return muted
}

/** BGM音量 0〜1 */
export function getVolume(): number {
  return bgmVol
}
export function setVolume(v: number): void {
  bgmVol = Math.max(0, Math.min(1, v))
  try {
    localStorage.setItem('ao-vol', String(bgmVol))
  } catch {
    /* noop */
  }
  if (bgm) bgm.volume = bgmVol
}

export function isSfxOn(): boolean {
  return sfxOn
}
export function toggleSfx(): boolean {
  sfxOn = !sfxOn
  try {
    localStorage.setItem('ao-sfx', sfxOn ? '1' : '0')
  } catch {
    /* noop */
  }
  if (sfxOn) sfx('select')
  return sfxOn
}

// ── 効果音(WebAudio合成) ──
type Ctx = AudioContext
let actx: Ctx | null = null
function ensureCtx(): Ctx | null {
  if (actx) return actx
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    actx = new AC()
  } catch {
    actx = null
  }
  return actx
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay: number): void {
  const ctx = actx
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  o.connect(g)
  g.connect(ctx.destination)
  const t0 = ctx.currentTime + delay
  const peak = gain * bgmVol
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

function sweep(f0: number, f1: number, dur: number, gain: number): void {
  const ctx = actx
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(f0, ctx.currentTime)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), ctx.currentTime + dur)
  o.connect(g)
  g.connect(ctx.destination)
  const peak = gain * bgmVol
  g.gain.setValueAtTime(0.0001, ctx.currentTime)
  g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
  o.start()
  o.stop(ctx.currentTime + dur + 0.03)
}

export type Sfx = 'select' | 'cancel' | 'hit' | 'crit' | 'heal' | 'faint' | 'catch' | 'badge'

/** 効果音を鳴らす(SFXオフ/未解禁なら無音) */
export function sfx(kind: Sfx): void {
  if (!sfxOn) return
  const ctx = ensureCtx()
  if (!ctx || ctx.state === 'suspended') ctx?.resume().catch(() => {})
  if (!actx) return
  switch (kind) {
    case 'select':
      tone(660, 0.08, 'square', 0.18, 0)
      break
    case 'cancel':
      tone(330, 0.1, 'square', 0.16, 0)
      break
    case 'hit':
      tone(180, 0.12, 'square', 0.22, 0)
      tone(120, 0.1, 'triangle', 0.18, 0.02)
      break
    case 'crit':
      tone(240, 0.1, 'sawtooth', 0.24, 0)
      tone(160, 0.16, 'square', 0.22, 0.04)
      break
    case 'heal':
      tone(523, 0.1, 'sine', 0.2, 0)
      tone(784, 0.16, 'sine', 0.2, 0.09)
      break
    case 'faint':
      sweep(440, 70, 0.5, 0.22)
      break
    case 'catch':
      tone(523, 0.09, 'square', 0.2, 0)
      tone(659, 0.09, 'square', 0.2, 0.1)
      tone(880, 0.18, 'square', 0.22, 0.2)
      break
    case 'badge':
      tone(659, 0.1, 'square', 0.2, 0)
      tone(880, 0.1, 'square', 0.2, 0.1)
      tone(1047, 0.24, 'square', 0.22, 0.2)
      break
  }
}
