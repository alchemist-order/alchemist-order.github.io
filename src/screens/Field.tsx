import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BattleConfig, GameState } from '../types'
import { ENCOUNTER_RATE, MAPS, TRAINERS, isWall } from '../game/maps'
import type { Npc } from '../game/maps'
import { LeaderToken, NpcToken, PlayerToken, PropToken } from '../ui'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onStartBattle: (config: BattleConfig) => void
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
  if (ch === 'H') return 'house'
  if (ch === 'W') return 'water'
  if (ch === 'G') return 'grass'
  if (ch === ',') return 'lawn'
  if (ch === 'F') return 'flower'
  if (ch === '~') return 'sand'
  return indoor ? 'floor' : 'path'
}

// public/tiles/<type>.png があれば差し替え。1度だけ存在確認(セッション内キャッシュ)
const TILE_NAMES = ['path', 'floor', 'lawn', 'grass', 'tree', 'wall', 'house', 'water', 'sand', 'flower']
const tileAvail: Record<string, boolean> = {}
let tileProbed = false

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export default function Field({ state, setState, onStartBattle, onMenu, onTalk, onBlockedExit }: Props) {
  const map = MAPS[state.pos.mapId]
  const { x, y } = state.pos
  const cols = map.grid[0].length
  const rows = map.grid.length
  const indoor = !!map.indoor
  const hasStarter = state.collection.length > 0
  const posRef = useRef(state.pos)
  const holdRef = useRef<number | undefined>(undefined)
  const [flip, setFlip] = useState(false)
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
  }

  function move(dx: number, dy: number) {
    if (dx < 0) setFlip(true)
    else if (dx > 0) setFlip(false)
    const cur = posRef.current
    const m = MAPS[cur.mapId]
    const nx = cur.x + dx
    const ny = cur.y + dy
    if (ny < 0 || ny >= m.grid.length || nx < 0 || nx >= m.grid[0].length) return

    if (m.leader && m.leader.x === nx && m.leader.y === ny) {
      stopHold()
      const trainer = TRAINERS[m.leader.trainerId]
      if (!state.defeatedTrainers.includes(trainer.id)) {
        onStartBattle({ kind: 'trainer', trainer, biome: m.biome })
      }
      return
    }

    const npc = m.npcs?.find((n) => n.x === nx && n.y === ny)
    if (npc) {
      stopHold()
      onTalk(npc)
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
      const np = { mapId: warp.to, x: warp.tx, y: warp.ty }
      posRef.current = np
      setState((s) => ({ ...s, pos: np }))
      return
    }

    const np = { ...cur, x: nx, y: ny }
    posRef.current = np
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  return (
    <div className="screen field">
      <div className="field-header">
        <span className="field-name">🗺 {map.name}</span>
        <span className="field-badges">🎖 {state.badges.length}</span>
      </div>
      {map.intro && <p className="field-intro">{map.intro}</p>}

      <div className="viewport" ref={vpRef}>
        <div className={`vp-window${indoor ? ' indoor' : ''}`} style={{ width: viewW || '100%', height: viewH || 260 }}>
          <div className="world" style={{ width: worldW, height: worldH, transform: `translate(${-camX}px, ${-camY}px)` }}>
            {map.grid.flatMap((row, ry) =>
              row.split('').map((ch, rx) => {
                const type = tileType(ch, indoor)
                return (
                  <div
                    key={`${rx}-${ry}`}
                    className={`tile2 t-${type}`}
                    style={{ left: rx * TILE, top: ry * TILE, width: TILE, height: TILE, ...tileStyle(type) }}
                  />
                )
              }),
            )}
            {map.warps.map((w) => (
              <span
                key={`w${w.x}-${w.y}`}
                className="world-token warp-token"
                style={{ left: w.x * TILE, top: w.y * TILE, width: TILE, height: TILE }}
                aria-hidden
              />
            ))}
            {map.props?.map((p, i) => (
              <span key={`p${i}`} className={`world-token prop-token${p.kind === 'rug' ? ' prop-flat' : ''}`} style={{ left: p.x * TILE, top: p.y * TILE, width: TILE, height: TILE }}>
                <PropToken kind={p.kind} emoji={p.emoji} size={TILE} />
              </span>
            ))}
            {map.npcs?.map((n) => (
              <span key={`n${n.x}-${n.y}`} className="world-token" style={{ left: n.x * TILE, top: n.y * TILE, width: TILE, height: TILE }}>
                <NpcToken kind={n.kind} emoji={n.emoji} size={TILE * 0.9} />
              </span>
            ))}
            {map.leader && (
              <span className="world-token" style={{ left: map.leader.x * TILE, top: map.leader.y * TILE, width: TILE, height: TILE }}>
                <LeaderToken trainerId={map.leader.trainerId} defeated={leaderDefeated} size={TILE * 1.05} />
              </span>
            )}
            <span className="world-token player-token" style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE }}>
              <PlayerToken flip={flip} size={TILE * 0.82} />
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
