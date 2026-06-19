import { useEffect } from 'react'
import type { BattleConfig, GameState } from '../types'
import { ENCOUNTER_RATE, MAPS, TRAINERS, isWall } from '../game/maps'

interface Props {
  state: GameState
  setState: (updater: (s: GameState) => GameState) => void
  onStartBattle: (config: BattleConfig) => void
  onMenu: () => void
}

function tileClass(ch: string): string {
  if (ch === '#') return 'wall'
  if (ch === 'H') return 'house'
  if (ch === 'G') return 'grass'
  return 'ground'
}

export default function Field({ state, setState, onStartBattle, onMenu }: Props) {
  const map = MAPS[state.pos.mapId]
  const { x, y } = state.pos

  function move(dx: number, dy: number) {
    const nx = x + dx
    const ny = y + dy
    if (ny < 0 || ny >= map.grid.length || nx < 0 || nx >= map.grid[0].length) return

    // 支部長に話しかける(隣接マスへ進もうとする)
    if (map.leader && map.leader.x === nx && map.leader.y === ny) {
      const trainer = TRAINERS[map.leader.trainerId]
      if (!state.defeatedTrainers.includes(trainer.id)) {
        onStartBattle({ kind: 'trainer', trainer, biome: map.biome })
      }
      return
    }

    const ch = map.grid[ny][nx]
    if (isWall(ch)) return

    // ワープ
    const warp = map.warps.find((w) => w.x === nx && w.y === ny)
    if (warp) {
      setState((s) => ({ ...s, pos: { mapId: warp.to, x: warp.tx, y: warp.ty } }))
      return
    }

    setState((s) => ({ ...s, pos: { ...s.pos, x: nx, y: ny } }))

    // 草むらでエンカウント
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

  // キーボード操作
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

  return (
    <div className="screen field">
      <div className="field-header">
        <span className="field-name">🗺 {map.name}</span>
        <span className="field-badges">🎖 {state.badges.length}</span>
      </div>
      {map.intro && <p className="field-intro">{map.intro}</p>}

      <div
        className="map-grid"
        style={{ gridTemplateColumns: `repeat(${map.grid[0].length}, 1fr)` }}
      >
        {map.grid.flatMap((row, ry) =>
          row.split('').map((ch, rx) => {
            const isPlayer = rx === x && ry === y
            const isLeader = map.leader && map.leader.x === rx && map.leader.y === ry
            const isWarp = map.warps.some((w) => w.x === rx && w.y === ry)
            return (
              <div key={`${rx}-${ry}`} className={`tile ${tileClass(ch)}`}>
                {isWarp && !isPlayer && <span className="tile-icon">🚪</span>}
                {isLeader && !isPlayer && (
                  <span className="tile-icon">{leaderDefeated ? '🧙' : '🧙‍♀️'}</span>
                )}
                {isPlayer && <span className="tile-icon player-mark">🧝</span>}
              </div>
            )
          }),
        )}
      </div>

      <div className="field-controls">
        <div className="dpad">
          <button className="dpad-btn up" onClick={() => move(0, -1)}>
            ↑
          </button>
          <button className="dpad-btn left" onClick={() => move(-1, 0)}>
            ←
          </button>
          <button className="dpad-btn right" onClick={() => move(1, 0)}>
            →
          </button>
          <button className="dpad-btn down" onClick={() => move(0, 1)}>
            ↓
          </button>
        </div>
        <button className="move-btn menu-btn" onClick={onMenu}>
          <span className="move-name">📋 メニュー</span>
          <span className="move-meta">手持ち・図鑑</span>
        </button>
      </div>
      <p className="field-hint">矢印キー / WASD でも移動できます。草むらに幻獣がひそむ。</p>
    </div>
  )
}
