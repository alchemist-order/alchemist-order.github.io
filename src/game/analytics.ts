// アクセス計測(O1)。GA4(gtag.js)への薄いラッパー。
// GA_MEASUREMENT_ID が空の間は外部送信せず、自己確認用に直近イベントをlocalStorageへ貯めるだけ(no-op安全)。
// ★X告知の前に GA_MEASUREMENT_ID に GA4測定ID(G-XXXXXXXXXX)を設定すること(初動データの取り逃し防止)。
// 送信するのは匿名のゲーム内イベントのみ。個人情報・入力テキストは一切送らない。

const GA_MEASUREMENT_ID = '' // ← 告知前にここへ 'G-XXXXXXXXXX' を設定

type Params = Record<string, string | number | boolean>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let started = false

/** 起動時に1回。GA_MEASUREMENT_ID があれば gtag.js を読み込む。 */
export function initAnalytics(): void {
  if (started) return
  started = true
  if (!GA_MEASUREMENT_ID) return // ID未設定=送信しない(告知前の既定状態)
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(s)
  window.dataLayer = window.dataLayer || []
  const gtag = (...args: unknown[]) => { window.dataLayer!.push(args) }
  gtag('js', new Date())
  gtag('config', GA_MEASUREMENT_ID)
  window.gtag = gtag
}

/** ゲーム内イベントを記録。GA4があれば送信、無くても直近ログをlocalStorageに残す(自己確認用)。 */
export function track(event: string, params: Params = {}): void {
  try {
    if (GA_MEASUREMENT_ID && window.gtag) window.gtag('event', event, params)
    // 自己確認用: 直近50件をlocalStorageへ(送信の有無に関わらず)
    const key = 'ao-analytics-log'
    const log = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
    log.push({ t: Date.now(), event, ...params })
    if (log.length > 50) log.splice(0, log.length - 50)
    localStorage.setItem(key, JSON.stringify(log))
  } catch {
    /* 計測失敗はゲーム進行に影響させない */
  }
}
