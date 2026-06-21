import { useEffect, useState } from 'react'
import type { BattleConfig, GameState } from '../types'
import { ENCOUNTER_RATE, MAPS, TRAINERS, isWall } from '../game/maps'
import type { Npc } from '../game/maps'
import { LeaderToken, NpcToken, PlayerToken } from '../ui'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onStartBattle: (config: BattleConfig) => void
  onMenu: () => void
  onTalk: (npc: Npc) => void
  onBlockedExit: () => void
}

const missingMaps = new Set<string>()

function tileClass(ch: string): string {
  if (ch === '#') return 'wall'
  if (ch === 'H') return 'house'
  if (ch === 'G') return 'grass'
  return 'ground'
}

export default function Field({ state, setState, onStartBattle, onMenu, onTalk, onBlockedExit }: Props) {
  const map = MAPS[state.pos.mapId]
  const { x, y } = state.pos
  const cols = map.grid[0].length
  const rows = map.grid.length
  const mapArtUrl = `${import.meta.env.BASE_URL}bg/map/${map.id}.png`
  const [artOk, setArtOk] = useState(!missingMaps.has(map.id))
  const [flip, setFlip] = useState(false)
  const hasStarter = state.collection.length > 0

  useEffect(() => {
    if (missingMaps.has(map.id)) {
      setArtOk(false)
      return
    }
    const img = new Image()
    img.onload = () => setArtOk(true)
    img.onerror = () => {
      missingMaps.add(map.id)
      setArtOk(false)
    }
    img.src = mapArtUrl
  }, [map.id, mapArtUrl])

  function move(dx: number, dy: number) {
    if (dx < 0) setFlip(true)
    else if (dx > 0) setFlip(false)
    const nx = x + dx
    const ny = y + dy
    if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) return

    // 支部長に話しかける
    if (map.leader && map.leader.x === nx && map.leader.y === ny) {
      const trainer = TRAINERS[map.leader.trainerId]
      if (!state.defeatedTrainers.includes(trainer.id)) {
        onStartBattle({ kind: 'trainer', trainer, biome: map.biome })
      }
      return
    }

    // NPCに話しかける(進入不可)
    const npc = map.npcs?.find((n) => n.x === nx && n.y === ny)
    if (npc) {
      onTalk(npc)
      return
    }

    const ch = map.grid[ny][nx]
    if (isWall(ch)) return

    // ワープ(幻獣未所持なら村から出られない)
    const warp = map.warps.find((w) => w.x === nx && w.y === ny)
    if (warp) {
      if (warp.gate === 'starter' && !hasStarter) {
        onBlockedExit()
        return
      }
      setState((s) => ({ ...s, pos: { mapId: warp.to, x: warp.tx, y: warp.ty } }))
      return
    }

    setState((s) => ({ ...s, pos: { ...s.pos, x: nx, y: ny } }))

    if (ch === 'G' && map.encounter && Math.random() < ENCOUNTER_RATE) {
      onStartBattle({
        kind: 'wild',
        pool: map.encounter.pool,
        min: map.encounter.min,
        max: map.encounter.max,
        biome: map.biome,
      })
    }
  }

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
  const pct = (tx: number, ty: number) => ({
    left: `${((tx + 0.5) / cols) * 100}%`,
    top: `${((ty + 0.5) / rows) * 100}%`,
  })

  return (
    <div className="screen field">
      <div className="field-header">
        <span className="field-name">🗺 {map.name}</span>
        <span className="field-badges">🎖 {state.badges.length}</span>
      </div>
      {map.intro && <p className="field-intro">{map.intro}</p>}

      {artOk ? (
        <div className="map-art" style={{ backgroundImage: `url(${mapArtUrl})`, aspectRatio: `${cols} / ${rows}` }}>
          {map.warps.map((w) => (
            <span key={`w${w.x}-${w.y}`} className="map-token warp-token" style={pct(w.x, w.y)}>
              🚪
            </span>
          ))}
          {map.npcs?.map((n) => (
            <span key={`n${n.x}-${n.y}`} className="map-token npc-token" style={pct(n.x, n.y)}>
              <NpcToken kind={n.kind} size={46} />
            </span>
          ))}
          {map.leader && (
            <span className="map-token leader-token" style={pct(map.leader.x, map.leader.y)}>
              <LeaderToken trainerId={map.leader.trainerId} defeated={leaderDefeated} size={50} />
            </span>
          )}
          <span className="map-token player-token" style={pct(x, y)}>
            <PlayerToken flip={flip} size={38} />
          </span>
        </div>
      ) : (
        <div className={`map-grid${map.indoor ? ' indoor' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {map.grid.flatMap((row, ry) =>
            row.split('').map((ch, rx) => {
              const isPlayer = rx === x && ry === y
              const isLeader = map.leader && map.leader.x === rx && map.leader.y === ry
              const isWarp = map.warps.some((w) => w.x === rx && w.y === ry)
              const npc = map.npcs?.find((n) => n.x === rx && n.y === ry)
              return (
                <div key={`${rx}-${ry}`} className={`tile ${tileClass(ch)}`}>
                  {isWarp && !isPlayer && <span className="tile-icon">🚪</span>}
                  {npc && !isPlayer && (
                    <span className="tile-icon">
                      <NpcToken kind={npc.kind} size={28} />
                    </span>
                  )}
                  {isLeader && !isPlayer && (
                    <span className="tile-icon">
                      <LeaderToken trainerId={map.leader!.trainerId} defeated={leaderDefeated} size={32} />
                    </span>
                  )}
                  {isPlayer && (
                    <span className="tile-icon player-mark">
                      <PlayerToken flip={flip} size={28} />
                    </span>
                  )}
                </div>
              )
            }),
          )}
        </div>
      )}

      <div className="field-controls">
        <div className="dpad">
          <button className="dpad-btn up" onClick={() => move(0, -1)}>↑</button>
          <button className="dpad-btn left" onClick={() => move(-1, 0)}>←</button>
          <button className="dpad-btn right" onClick={() => move(1, 0)}>→</button>
          <button className="dpad-btn down" onClick={() => move(0, 1)}>↓</button>
        </div>
        <button className="move-btn menu-btn" onClick={onMenu}>
          <span className="move-name">📋 メニュー</span>
          <span className="move-meta">手持ち・図鑑・どうぐ</span>
        </button>
      </div>
      <p className="field-hint">矢印キー / WASD でも移動。人に話しかけ、草むらで幻獣に出会う。</p>
    </div>
  )
}
