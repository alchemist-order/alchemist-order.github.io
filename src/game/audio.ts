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

// 単音(軽いビブラート/デチューンで厚みを出す)
function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay: number, detune = 0): void {
  const ctx = actx
  if (!ctx) return
  const t0 = ctx.currentTime + delay
  const peak = gain * bgmVol
  const g = ctx.createGain()
  g.connect(ctx.destination)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  const mk = (det: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = det
    o.connect(g)
    o.start(t0)
    o.stop(t0 + dur + 0.03)
  }
  mk(0)
  if (detune) mk(detune) // 重ねて厚みを出す
}

function sweep(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sawtooth', delay = 0): void {
  const ctx = actx
  if (!ctx) return
  const t0 = ctx.currentTime + delay
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(f0, t0)
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
  o.connect(g)
  g.connect(ctx.destination)
  const peak = gain * bgmVol
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.start(t0)
  o.stop(t0 + dur + 0.03)
}

// ノイズ衝撃音(打撃・爆発感)
function noise(dur: number, gain: number, delay: number, filter: BiquadFilterType, freq: number): void {
  const ctx = actx
  if (!ctx) return
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  const g = ctx.createGain()
  src.connect(f)
  f.connect(g)
  g.connect(ctx.destination)
  const t0 = ctx.currentTime + delay
  const peak = gain * bgmVol
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

export type Sfx = 'select' | 'cancel' | 'confirm' | 'hit' | 'crit' | 'heal' | 'faint' | 'catch' | 'badge' | 'encounter' | 'door'

/** 効果音を鳴らす(SFXオフ/未解禁なら無音) */
export function sfx(kind: Sfx): void {
  if (!sfxOn) return
  const ctx = ensureCtx()
  if (!ctx || ctx.state === 'suspended') ctx?.resume().catch(() => {})
  if (!actx) return
  switch (kind) {
    case 'select': // 軽快なクリック
      tone(1280, 0.045, 'square', 0.12, 0)
      tone(1820, 0.04, 'square', 0.1, 0.022)
      break
    case 'cancel':
      tone(620, 0.07, 'square', 0.13, 0)
      tone(360, 0.09, 'square', 0.12, 0.05)
      break
    case 'confirm': // 決定(2音上昇)
      tone(740, 0.08, 'square', 0.16, 0)
      tone(1110, 0.13, 'square', 0.16, 0.07)
      break
    case 'hit': // 打撃: ノイズ＋低音
      noise(0.09, 0.26, 0, 'bandpass', 1100)
      tone(150, 0.11, 'square', 0.2, 0)
      break
    case 'crit': // 会心: 鋭いノイズ＋ブライト
      noise(0.13, 0.34, 0, 'highpass', 1400)
      tone(230, 0.15, 'sawtooth', 0.26, 0, 14)
      tone(360, 0.1, 'square', 0.2, 0.04)
      break
    case 'heal': // 上昇アルペジオ(やわらか)
      tone(523, 0.12, 'sine', 0.18, 0)
      tone(659, 0.12, 'sine', 0.18, 0.08)
      tone(880, 0.18, 'sine', 0.18, 0.16)
      break
    case 'faint': // 下降(力尽きる)
      sweep(540, 70, 0.55, 0.22, 'sawtooth')
      noise(0.3, 0.1, 0.1, 'lowpass', 500)
      break
    case 'catch': // 捕獲成功(キラッ)
      tone(523, 0.09, 'square', 0.18, 0)
      tone(659, 0.09, 'square', 0.18, 0.1)
      tone(880, 0.12, 'square', 0.2, 0.2)
      tone(1320, 0.22, 'sine', 0.18, 0.32)
      break
    case 'badge': // 記章獲得ファンファーレ
      tone(659, 0.1, 'square', 0.18, 0)
      tone(880, 0.1, 'square', 0.18, 0.1)
      tone(1047, 0.1, 'square', 0.18, 0.2)
      tone(1319, 0.3, 'square', 0.2, 0.3, 8)
      break
    case 'encounter': // 戦闘開始スティング(かっこいい系)
      tone(880, 0.08, 'square', 0.22, 0, 10)
      tone(660, 0.08, 'square', 0.22, 0.1, 10)
      tone(880, 0.09, 'square', 0.22, 0.2, 10)
      sweep(180, 1100, 0.38, 0.2, 'sawtooth', 0.3)
      noise(0.45, 0.16, 0.3, 'lowpass', 380)
      break
    case 'door':
      tone(170, 0.055, 'square', 0.16, 0)
      noise(0.08, 0.18, 0.025, 'bandpass', 850)
      sweep(145, 78, 0.34, 0.13, 'sawtooth', 0.08)
      noise(0.28, 0.08, 0.08, 'lowpass', 420)
      break
  }
}
