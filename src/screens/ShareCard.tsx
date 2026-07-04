import { useEffect, useRef, useState } from 'react'
import { spriteFileNo } from '../game/sprites'
import { rarityOf } from '../game/state'
import { track } from '../game/analytics'

const BASE = import.meta.env.BASE_URL

// 試練の塔のスコアをSNS共有カード(Canvas)に描く。幻獣画×階数×★×名前(O5)。
// 画像保存/Web Share。同一オリジン画像なのでtoBlob可(汚染なし)。
export interface ShareData {
  reached: number
  best: number
  speciesId: string
  monName: string
  type: string
  level: number
  talent?: number
  mutant?: boolean
  playerName?: string
  title: string // playerTitle
}

const W = 640
const H = 360

export default function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [shareMsg, setShareMsg] = useState('')

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    // 背景(火山と夜空の中間的なダークグラデ)
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#241a12')
    bg.addColorStop(1, '#120b08')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    // 金枠
    ctx.strokeStyle = '#d4af5a'
    ctx.lineWidth = 4
    ctx.strokeRect(8, 8, W - 16, H - 16)

    // タイトル
    ctx.fillStyle = '#cdbf9c'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('錬金幻獣録 アルケミスト・オーダー', 28, 44)

    // 大見出し(階数)
    ctx.fillStyle = '#f0d99a'
    ctx.font = 'bold 62px sans-serif'
    ctx.fillText(`試練の塔 ${data.reached}階`, 28, 130)
    ctx.fillStyle = '#e2c23b'
    ctx.font = 'bold 34px sans-serif'
    ctx.fillText('制覇！', 28, 176)

    // 自己ベスト・プレイヤー
    ctx.fillStyle = '#cdbf9c'
    ctx.font = '18px sans-serif'
    ctx.fillText(`自己ベスト ${data.best}階`, 28, 214)
    ctx.fillText(`${data.playerName || 'ななし'} ／ ${data.title}`, 28, 240)

    // 相棒の情報(名前・Lv・★・変異)
    const rar = rarityOf(data.talent ?? 0)
    ctx.fillStyle = '#f3e6c4'
    ctx.font = 'bold 22px sans-serif'
    const monLabel = `${data.mutant ? '✨' : ''}${data.monName} Lv.${data.level}${rar ? ' ' + rar.stars : ''}`
    ctx.fillText(monLabel, 28, 300)

    // ハッシュタグ
    ctx.fillStyle = '#8a7a55'
    ctx.font = '15px sans-serif'
    ctx.fillText('#アルケミストオーダー', 28, 328)

    // 相棒スプライト(右側に大きく)
    const img = new Image()
    img.onload = () => {
      const size = 240
      const dx = W - size - 20
      const dy = (H - size) / 2 + 10
      if (data.mutant) ctx.filter = 'hue-rotate(150deg) saturate(1.25)'
      ctx.drawImage(img, dx, dy, size, size)
      ctx.filter = 'none'
      setReady(true)
    }
    img.onerror = () => setReady(true) // 画像無しでもカードは出す
    img.src = `${BASE}sprites/${spriteFileNo(data.speciesId)}.png`
  }, [data])

  const download = () => {
    const cv = canvasRef.current
    if (!cv) return
    cv.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `alchemist-tower-${data.reached}f.png`
      a.click()
      URL.revokeObjectURL(url)
      setShareMsg('画像を保存しました')
      track('share_card', { reached: data.reached, method: 'download' })
    }, 'image/png')
  }

  const share = () => {
    const cv = canvasRef.current
    if (!cv) return
    cv.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `alchemist-tower-${data.reached}f.png`, { type: 'image/png' })
      const text = `試練の塔 ${data.reached}階 制覇！ #アルケミストオーダー`
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text })
          setShareMsg('共有しました')
          track('share_card', { reached: data.reached, method: 'webshare' })
        } else {
          download()
        }
      } catch {
        setShareMsg('共有をキャンセルしました')
      }
    }, 'image/png')
  }

  const canWebShare = typeof navigator !== 'undefined' && !!navigator.canShare

  return (
    <div className="get-overlay" onClick={onClose}>
      <div className="get-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '94vw' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>🗼 スコアカード</h3>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ width: '100%', maxWidth: 420, height: 'auto', borderRadius: 8, border: '1px solid rgba(212,175,90,0.4)', opacity: ready ? 1 : 0.5 }}
        />
        <p className="cmd-sub" style={{ margin: '6px 0' }}>{shareMsg || '記録をSNSでシェアしよう'}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {canWebShare && (
            <button className="title-btn primary" style={{ padding: '6px 16px', fontSize: 14 }} onClick={share}>
              シェアする
            </button>
          )}
          <button className="title-btn" style={{ padding: '6px 16px', fontSize: 14 }} onClick={download}>
            画像を保存
          </button>
          <button className="title-btn" style={{ padding: '6px 16px', fontSize: 14 }} onClick={onClose}>
            とじる
          </button>
        </div>
      </div>
    </div>
  )
}
