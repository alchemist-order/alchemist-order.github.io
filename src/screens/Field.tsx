import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BattleConfig, GameState } from '../types'
import { ENCOUNTER_RATE, MAPS, TRAINERS, isWall, isLedgeBlocked } from '../game/maps'
import type { Ambient, Chest, Npc } from '../game/maps'
import { hasFlag } from '../game/state'
import { sfx } from '../game/audio'
import { Building, ChestToken, LeaderToken, NpcToken, PlayerToken, PropToken, type Dir } from '../ui'
import '../field-zones.css'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onStartBattle: (config: BattleConfig) => void
  onTrainer: (trainer: (typeof TRAINERS)[string], biome: string) => void
  onChest: (chest: Chest) => void
  onMenu: () => void
  onTalk: (npc: Npc) => void
  onBlockedExit: (msg: string) => void
}

const BASE = import.meta.env.BASE_URL
const VIEW_COLS = 11 // 横に見えるタイル数(これでカメラの寄りが決まる)
const VIEW_ROWS = 9

// グリッド文字 → タイル種別
function tileType(ch: string, indoor: boolean): string {
  if (ch === '#') return indoor ? 'wall' : 'tree'
  if (ch === 'H') return 'lawn' // 建物の足元は地面として描画(上に立体の家を重ねる)
  if (ch === 'W') return 'water'
  if (ch === 'G') return 'grass'
  if (ch === ',') return 'lawn'
  if (ch === 'F') return 'flower'
  if (ch === '~') return 'sand'
  if (ch === 'P') return 'plaza'
  if (ch === 'D') return 'dirt'
  if (ch === 'C') return 'cliff'
  if (ch === 'S') return 'stairs'
  if (ch === 'L') return 'ledge'
  return indoor ? 'floor' : 'path'
}

// public/tiles/<type>.png があれば差し替え。1度だけ存在確認(セッション内キャッシュ)
const TILE_NAMES = ['path', 'floor', 'lawn', 'grass', 'tree', 'wall', 'house', 'water', 'sand', 'flower', 'plaza', 'dirt', 'cliff', 'stairs', 'ledge']
const tileAvail: Record<string, boolean> = {}
let tileProbed = false

// 小物ごとの大きさ(タイル比)。大きい家具は1超、小物は1未満。
const PROP_SCALE: Record<string, number> = {
  bed: 1.25, bookshelf: 1.4, cauldron: 1.1, candle: 0.8, fireplace: 1.25, plant: 1.0,
  rug: 1.0, window: 1.05, fountain: 1.3, barrel: 1.0, crate: 1.0, lamp: 1.2, flower: 0.75,
  fence: 1.0, sign: 1.1, rock: 1.05, mushroom: 0.85, log: 1.0, anchor: 1.2, shell: 0.7,
  table: 1.0, chair: 0.7, shelf: 1.25, pot: 0.6, painting: 0.95, clock: 0.6, stove: 1.05, vase: 0.62,
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const AMBIENT_EMOJI: Record<string, string> = {
  bird: '🐦',
  butterfly: '🦋',
  firefly: '✨',
  cat: '🐈',
  gull: '🕊️',
  fish: '🐟',
  leaf: '🍃',
  wisp: '✦',
}

const ambientHash = (text: string): number => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
const ambientRand = (seed: number, salt: number): number => {
  let n = (seed + Math.imul(salt + 1, 0x9e3779b9)) >>> 0
  n ^= n << 13
  n ^= n >>> 17
  n ^= n << 5
  return ((n >>> 0) % 10000) / 10000
}

function AmbientToken({ ambient, size }: { ambient: Ambient; size: number }) {
  const [failed, setFailed] = useState(false)
  const emoji = ambient.emoji ?? AMBIENT_EMOJI[ambient.kind] ?? '·'
  if (failed) return <span className="ambient-emoji" style={{ fontSize: size * 0.8 }}>{emoji}</span>
  return (
    <img
      className="ambient-img"
      src={`${BASE}ui/ambient_${ambient.kind}.png`}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  )
}

// オートタイル対象(縁を丸める自然地形)
const AUTOTILE = new Set(['grass', 'water'])
// 角に差し込む隣接地形を選ぶ(地面優先、無ければ非自身、最後はpath)
const groundPick = (type: string, a: string, b: string): string => {
  for (const t of [a, b]) if (t !== type && t !== 'edge' && t !== 'tree' && t !== 'wall') return t
  for (const t of [a, b]) if (t !== type && t !== 'edge') return t
  return 'path'
}
// 反復感を消す: 自然物タイルは座標ハッシュで反転/明るさを微変化、一部に装飾デカール
const VARY_TYPES = new Set(['grass', 'lawn', 'tree', 'flower', 'sand'])
const tileHash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0
const decalFor = (type: string, h: number): string | null =>
  type === 'grass' && h % 5 === 0 ? 'g' : type === 'lawn' && h % 6 === 0 ? 'l' : type === 'path' && h % 9 === 0 ? 'p' : null

export default function Field({ state, setState, onStartBattle, onTrainer, onChest, onMenu, onTalk, onBlockedExit }: Props) {
  const map = MAPS[state.pos.mapId]
  const { x, y } = state.pos
  const cols = map.grid[0].length
  const rows = map.grid.length
  const indoor = !!map.indoor
  const hasStarter = state.collection.length > 0
  const posRef = useRef(state.pos)
  const holdRef = useRef<number | undefined>(undefined)
  const [dir, setDir] = useState<Dir>('down')
  const [step, setStep] = useState<0 | 1>(0)
  const [openingDoor, setOpeningDoor] = useState<string | null>(null)
  const doorTimerRef = useRef<number | undefined>(undefined)
  const vpRef = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(0)
  const [, force] = useState(0)

  useEffect(() => {
    posRef.current = state.pos
  }, [state.pos])

  // ビューポート幅を測ってタイルサイズを決める(レスポンシブ)
  useLayoutEffect(() => {
    const el = vpRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (w > 0) setVw((prev) => (prev === w ? prev : w))
    }
    update()
    // マウント直後に幅が0のことがあるので数フレーム再測定
    let tries = 0
    const tick = () => {
      update()
      if (++tries < 10 && el.clientWidth === 0) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // タイル画像の存在確認(無ければCSSの見た目を使う)
  useEffect(() => {
    if (tileProbed) return
    tileProbed = true
    TILE_NAMES.forEach((name) => {
      const img = new Image()
      img.onload = () => {
        tileAvail[name] = true
        force((n) => n + 1)
      }
      img.src = `${BASE}tiles/${name}.png`
    })
  }, [])

  function stopHold() {
    if (holdRef.current !== undefined) {
      window.clearInterval(holdRef.current)
      holdRef.current = undefined
    }
    setStep(0) // 立ち止まったら直立ポーズ
  }

  function move(dx: number, dy: number) {
    if (openingDoor) return
    setDir(dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right')
    const cur = posRef.current
    const m = MAPS[cur.mapId]
    const nx = cur.x + dx
    const ny = cur.y + dy
    if (ny < 0 || ny >= m.grid.length || nx < 0 || nx >= m.grid[0].length) return

    if (m.leader && m.leader.x === nx && m.leader.y === ny) {
      stopHold()
      const trainer = TRAINERS[m.leader.trainerId]
      if (!state.defeatedTrainers.includes(trainer.id)) {
        onTrainer(trainer, m.biome)
      }
      return
    }

    const npc = m.npcs?.find((n) => n.x === nx && n.y === ny)
    if (npc) {
      stopHold()
      onTalk(npc)
      return
    }

    const chest = m.chests?.find((c) => c.x === nx && c.y === ny)
    if (chest) {
      stopHold()
      onChest(chest)
      return
    }

    const prop = m.props?.find((p) => p.x === nx && p.y === ny)
    if (prop?.lines) {
      stopHold()
      onTalk({ x: nx, y: ny, kind: 'sign', name: prop.name ?? '', lines: prop.lines })
      return
    }
    if (prop?.solid) return

    const ch = m.grid[ny][nx]
    if (isWall(ch)) return
    if (isLedgeBlocked(ch, dy)) return // 崖のレッジ: 南向き(飛び降り)以外は塞ぐ

    const warp = m.warps.find((w) => w.x === nx && w.y === ny)
    if (warp) {
      stopHold()
      if (warp.gate === 'starter' && !hasStarter) {
        onBlockedExit('まだ相棒がいない。師ガレンに 話しかけて 最初の幻獣を 受け取ろう。')
        return
      }
      if (warp.gate && warp.gate !== 'starter' && !state.badges.includes(warp.gate)) {
        onBlockedExit(`「${warp.gate}」が ないと この先へは 進めないようだ。`)
        return
      }
      const building = m.buildings?.find((b) => b.x + Math.floor(b.w / 2) === warp.x && b.y + b.h === warp.y)
      if (building) {
        const key = `${building.x}-${building.y}`
        const atDoor = { ...cur, x: warp.x, y: warp.y }
        posRef.current = atDoor
        setDir('up')
        setStep((v) => (v ? 0 : 1))
        setOpeningDoor(key)
        sfx('door')
        setState((s) => ({ ...s, pos: atDoor }))
        doorTimerRef.current = window.setTimeout(() => {
          const np = { mapId: warp.to, x: warp.tx, y: warp.ty }
          posRef.current = np
          setOpeningDoor(null)
          setStep(0)
          setState((s) => ({ ...s, pos: np }))
          doorTimerRef.current = undefined
        }, 460)
        return
      }
      const np = { mapId: warp.to, x: warp.tx, y: warp.ty }
      posRef.current = np
      setState((s) => ({ ...s, pos: np }))
      return
    }

    const np = { ...cur, x: nx, y: ny }
    posRef.current = np
    setStep((s) => (s ? 0 : 1)) // 一歩ごとに足を入れ替え
    setState((s) => ({ ...s, pos: np }))

    if (ch === 'G' && m.encounter && Math.random() < ENCOUNTER_RATE) {
      stopHold()
      onStartBattle({ kind: 'wild', pool: m.encounter.pool, min: m.encounter.min, max: m.encounter.max, biome: m.biome })
    }
  }

  function startHold(dx: number, dy: number) {
    stopHold()
    move(dx, dy)
    holdRef.current = window.setInterval(() => move(dx, dy), 150)
  }

  useEffect(() => {
    const up = () => stopHold()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      stopHold()
      if (doorTimerRef.current !== undefined) window.clearTimeout(doorTimerRef.current)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      if (k === 'ArrowUp' || k === 'w') move(0, -1)
      else if (k === 'ArrowDown' || k === 's') move(0, 1)
      else if (k === 'ArrowLeft' || k === 'a') move(-1, 0)
      else if (k === 'ArrowRight' || k === 'd') move(1, 0)
      else return
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) setStep(0)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const leaderDefeated = map.leader ? state.defeatedTrainers.includes(TRAINERS[map.leader.trainerId].id) : false

  // カメラ: プレイヤーを中心に。マップが小さければ中央寄せ
  const TILE = vw > 0 ? vw / VIEW_COLS : 40
  const worldW = cols * TILE
  const worldH = rows * TILE
  const viewW = Math.min(vw || worldW, worldW)
  const viewH = Math.min(VIEW_ROWS * TILE, worldH)
  const camX = worldW <= viewW ? (worldW - viewW) / 2 : clamp(x * TILE + TILE / 2 - viewW / 2, 0, worldW - viewW)
  const camY = worldH <= viewH ? (worldH - viewH) / 2 : clamp(y * TILE + TILE / 2 - viewH / 2, 0, worldH - viewH)

  const tileStyle = (type: string): React.CSSProperties =>
    tileAvail[type] ? { backgroundImage: `url(${BASE}tiles/${type}.png)` } : {}

  // 近傍の地形種別(範囲外は 'edge')
  const typeAt = (tx: number, ty: number): string =>
    ty < 0 || ty >= rows || tx < 0 || tx >= cols ? 'edge' : tileType(map.grid[ty][tx], indoor)

  // 樹冠オーバーレイ(forest_canopy再利用): 森だけでなく、村の外周木列にも適用(パッケージC)
  const forestCanopies =
    map.biome === 'forest' || map.biome === 'town'
      ? map.grid.flatMap((row, ry) =>
          row.split('').flatMap((_, rx) => {
            if (typeAt(rx, ry) !== 'tree') return []
            const h = tileHash(rx, ry)
            const neighbors = [
              { dx: 0, dy: -1, type: typeAt(rx, ry - 1) },
              { dx: 1, dy: 0, type: typeAt(rx + 1, ry) },
              { dx: 0, dy: 1, type: typeAt(rx, ry + 1) },
              { dx: -1, dy: 0, type: typeAt(rx - 1, ry) },
            ]
            const open = neighbors.filter((n) => n.type !== 'tree' && n.type !== 'edge')
            if (open.length === 0 || h % 5 >= 3) return []
            return [{ rx, ry, h, openX: open.reduce((sum, n) => sum + n.dx, 0), openY: open.reduce((sum, n) => sum + n.dy, 0) }]
          }),
        )
      : []

  const forestUndergrowth =
    map.biome === 'forest'
      ? map.grid.flatMap((row, ry) =>
          row.split('').flatMap((_, rx) => {
            const type = typeAt(rx, ry)
            const h = tileHash(rx, ry)
            const nearTrees = [typeAt(rx, ry - 1), typeAt(rx + 1, ry), typeAt(rx, ry + 1), typeAt(rx - 1, ry)].filter((t) => t === 'tree').length
            return type !== 'tree' && nearTrees > 0 && h % 7 === 0 ? [{ rx, ry, h }] : []
          }),
        )
      : []

  const ambientInstances = useMemo(
    () =>
      (map.ambient ?? []).flatMap((a, ai) => {
        const count = Math.max(0, Math.floor(a.count ?? 1))
        return Array.from({ length: count }, (_, i) => {
          const seed = ambientHash(`${map.id}:${a.kind}:${a.style}:${ai}:${i}`)
          const rx = ambientRand(seed, 1)
          const ry = ambientRand(seed, 2)
          const areaW = Math.max(0.2, a.area.w)
          const areaH = Math.max(0.2, a.area.h)
          const px = a.style === 'fly' ? -0.12 : rx
          const py = 0.14 + ry * 0.72
          return {
            ambient: a,
            key: `a${ai}-${i}`,
            seed,
            x: (a.area.x + px * areaW) * TILE,
            y: (a.area.y + py * areaH) * TILE,
            tileY: a.area.y + py * areaH,
            size:
              TILE *
              (a.style === 'fly'
                ? 0.62 + ambientRand(seed, 8) * 0.18
                : a.style === 'flit'
                  ? 0.42 + ambientRand(seed, 8) * 0.15
                  : 0.55 + ambientRand(seed, 8) * 0.18),
            dx:
              a.style === 'fly'
                ? (areaW + 0.25) * TILE
                : (ambientRand(seed, 3) * 2 - 1) * Math.min(areaW * TILE * 0.42, TILE * 2.6),
            dy:
              a.style === 'fly'
                ? (ambientRand(seed, 4) * 2 - 1) * Math.min(areaH * TILE * 0.18, TILE * 0.75)
                : (ambientRand(seed, 4) * 2 - 1) * Math.min(areaH * TILE * 0.35, TILE * 1.6),
            duration:
              (a.style === 'fly' ? 10 : a.style === 'flit' ? 3.8 : 7.5) /
              Math.max(0.25, a.speed ?? 1) *
              (0.82 + ambientRand(seed, 5) * 0.42),
            delay: -ambientRand(seed, 6) * 9,
            flip: ambientRand(seed, 7) > 0.5,
          }
        })
      }),
    [map, TILE],
  )

  return (
    <div className="screen field">
      <div className="field-header">
        <span className="field-name">🗺 {map.name}</span>
        <span className="field-badges">🎖 {state.badges.length}</span>
      </div>
      {map.intro && <p className="field-intro">{map.intro}</p>}

      <div className="viewport" ref={vpRef}>
        <div className={`vp-window biome-${map.biome}${indoor ? ' indoor' : ''}`} style={{ width: viewW || '100%', height: viewH || 260 }}>
          <div className="world" style={{ width: worldW, height: worldH, transform: `translate(${-camX}px, ${-camY}px)` }}>
            {map.grid.flatMap((row, ry) =>
              row.split('').map((ch, rx) => {
                const type = tileType(ch, indoor)
                const h = tileHash(rx, ry)
                const auto = AUTOTILE.has(type)
                const vary = VARY_TYPES.has(type)
                const flip = vary && !auto && h & 1 ? 'scaleX(-1) ' : ''
                const scale = type === 'tree' ? 'scale(1.08)' : ''
                const transform = flip || scale ? `${flip}${scale}`.trim() : undefined
                const bright =
                  map.biome === 'forest' && type === 'tree'
                    ? 0.48 + ((h >> 1) % 5) * 0.025
                    : vary
                      ? 0.95 + ((h >> 1) % 6) * 0.02
                      : 1
                const decal = decalFor(type, h)
                // オートタイル: 外側の角に隣接地形を差し込んで丸める
                const corners: { p: string; t: string }[] = []
                if (auto) {
                  const U = typeAt(rx, ry - 1), D = typeAt(rx, ry + 1), L = typeAt(rx - 1, ry), R = typeAt(rx + 1, ry)
                  const o = (t: string) => t !== type
                  if (o(U) && o(L)) corners.push({ p: 'tl', t: groundPick(type, L, U) })
                  if (o(U) && o(R)) corners.push({ p: 'tr', t: groundPick(type, R, U) })
                  if (o(D) && o(L)) corners.push({ p: 'bl', t: groundPick(type, L, D) })
                  if (o(D) && o(R)) corners.push({ p: 'br', t: groundPick(type, R, D) })
                }
                return (
                  <div
                    key={`${rx}-${ry}`}
                    className={`tile2 t-${type}`}
                    style={{
                      left: rx * TILE,
                      top: ry * TILE,
                      width: TILE + 1,
                      height: TILE + 1,
                      ...tileStyle(type),
                      transform,
                      filter: bright !== 1 ? `brightness(${bright.toFixed(2)})` : undefined,
                    }}
                  >
                    {corners.map((c) => (
                      <span key={c.p} className={`tcorner tc-${c.p} t-${c.t}`} style={tileStyle(c.t)} />
                    ))}
                    {decal && <span className={`decal decal-${decal}`} style={{ top: `${12 + (h % 3) * 26}%`, left: `${12 + ((h >> 3) % 3) * 26}%` }} />}
                  </div>
                )
              }),
            )}
            {forestUndergrowth.map(({ rx, ry, h }) => (
              <img
                key={`fu${rx}-${ry}`}
                className="forest-undergrowth"
                src={`${BASE}ui/forest_undergrowth.png`}
                alt=""
                style={{
                  left: (rx - 0.3) * TILE,
                  top: (ry + 0.34) * TILE,
                  width: TILE * 1.6,
                  height: TILE * 0.76,
                  transform: h & 1 ? 'scaleX(-1)' : undefined,
                }}
              />
            ))}
            {map.warps.map((w) => (
              <span
                key={`w${w.x}-${w.y}`}
                className="world-token warp-token"
                style={{ left: w.x * TILE, top: w.y * TILE, width: TILE, height: TILE, zIndex: 100 + w.y * 10 }}
                aria-hidden
              />
            ))}
            {map.buildings?.map((b, i) => (
              <span
                key={`b${i}`}
                className="world-token building-token"
                style={{ left: b.x * TILE, top: (b.y - 2) * TILE, width: b.w * TILE, height: (b.h + 2) * TILE, zIndex: 100 + (b.y + b.h) * 10 }}
              >
                <Building kind={b.kind} w={b.w} tile={TILE} doorOpen={openingDoor === `${b.x}-${b.y}`} />
              </span>
            ))}
            {map.props?.map((p, i) => (
              <span
                key={`p${i}`}
                className={`world-token prop-token${p.kind === 'rug' ? ' prop-flat' : ''}`}
                style={{ left: p.x * TILE, top: p.y * TILE, width: TILE, height: TILE, zIndex: p.kind === 'rug' ? 3 : 105 + p.y * 10 }}
              >
                <PropToken kind={p.kind} emoji={p.emoji} size={TILE * (PROP_SCALE[p.kind] ?? 1)} />
              </span>
            ))}
            {map.chests?.map((c) => (
              <span key={`c${c.id}`} className="world-token prop-token" style={{ left: c.x * TILE, top: c.y * TILE, width: TILE, height: TILE, zIndex: 105 + c.y * 10 }}>
                <ChestToken open={hasFlag(state, `chest_${c.id}`)} size={TILE * 0.92} />
              </span>
            ))}
            {ambientInstances.map((a) => (
              <span
                key={a.key}
                className={`world-token ambient-token ambient-${a.ambient.style}`}
                style={
                  {
                    left: a.x,
                    top: a.y,
                    width: a.size,
                    height: a.size,
                    zIndex: 104 + Math.floor(a.tileY) * 10,
                    '--ambient-dx': `${a.dx}px`,
                    '--ambient-dy': `${a.dy}px`,
                    '--ambient-duration': `${a.duration}s`,
                    '--ambient-delay': `${a.delay}s`,
                    '--ambient-flip': a.flip ? -1 : 1,
                  } as React.CSSProperties
                }
              >
                <AmbientToken ambient={a.ambient} size={a.size} />
              </span>
            ))}
            {map.npcs?.map((n) => (
              <span key={`n${n.x}-${n.y}`} className="world-token person-token" style={{ left: n.x * TILE, top: n.y * TILE, width: TILE, height: TILE, zIndex: 107 + n.y * 10 }}>
                <NpcToken kind={n.kind} emoji={n.emoji} sprite={n.sprite} size={TILE * 1.25} />
              </span>
            ))}
            {map.leader && (
              <span className="world-token person-token" style={{ left: map.leader.x * TILE, top: map.leader.y * TILE, width: TILE, height: TILE, zIndex: 107 + map.leader.y * 10 }}>
                <LeaderToken trainerId={map.leader.trainerId} defeated={leaderDefeated} size={TILE * 1.25} />
              </span>
            )}
            {forestCanopies.map(({ rx, ry, h, openX, openY }) => {
              const variant = h % 3
              const file = variant === 0 ? 'forest_canopy' : variant === 1 ? 'forest_tree_tall' : 'forest_tree_wide'
              const width =
                variant === 0 ? 2.02 + ((h >> 2) % 4) * 0.08 : variant === 1 ? 1.2 + ((h >> 2) % 3) * 0.07 : 2.15 + ((h >> 2) % 4) * 0.09
              const height = variant === 0 ? width * 0.9 : variant === 1 ? width * 1.62 : width * 0.68
              const offsetX = (((h >> 5) % 5) - 2) * 0.045 - openX * 0.22
              const offsetY = (((h >> 8) % 5) - 2) * 0.025 - openY * 0.14
              return (
                <img
                  key={`fc${rx}-${ry}`}
                  className="forest-canopy"
                  src={`${BASE}ui/${file}.png`}
                  alt=""
                  style={{
                    left: (rx + 0.5 - width / 2 + offsetX) * TILE,
                    top: (ry + 1 - height + offsetY) * TILE,
                    width: TILE * width,
                    height: TILE * height,
                    zIndex: 108 + ry * 10,
                    opacity: 0.9 + (h % 4) * 0.025,
                    filter: `saturate(${0.8 + (h % 3) * 0.04}) brightness(${0.76 + ((h >> 3) % 4) * 0.035}) drop-shadow(0 8px 7px rgba(8,18,8,.58))`,
                    transform: h & 1 ? 'scaleX(-1)' : undefined,
                  }}
                />
              )
            })}
            <span className="world-token player-token person-token" style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE, zIndex: 107 + y * 10 }}>
              <PlayerToken dir={dir} step={step} size={TILE * 1.25} />
            </span>
          </div>
        </div>
      </div>

      <div className="field-controls">
        <div className="dpad">
          <button className="dpad-btn up" onPointerDown={(e) => { e.preventDefault(); startHold(0, -1) }} onPointerUp={stopHold} onPointerLeave={stopHold}>↑</button>
          <button className="dpad-btn left" onPointerDown={(e) => { e.preventDefault(); startHold(-1, 0) }} onPointerUp={stopHold} onPointerLeave={stopHold}>←</button>
          <button className="dpad-btn right" onPointerDown={(e) => { e.preventDefault(); startHold(1, 0) }} onPointerUp={stopHold} onPointerLeave={stopHold}>→</button>
          <button className="dpad-btn down" onPointerDown={(e) => { e.preventDefault(); startHold(0, 1) }} onPointerUp={stopHold} onPointerLeave={stopHold}>↓</button>
        </div>
        <button className="move-btn menu-btn" onClick={onMenu}>
          <span className="move-name">📋 メニュー</span>
          <span className="move-meta">手持ち・図鑑・どうぐ</span>
        </button>
      </div>
      <p className="field-hint">矢印キー / WASD でも移動。画面はマップの一部。歩くと景色がスクロールする。</p>
    </div>
  )
}
