import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initAnalytics } from './game/analytics'

initAnalytics() // アクセス計測(O1)。GA_MEASUREMENT_ID未設定なら何もしない

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
