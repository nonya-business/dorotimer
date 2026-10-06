import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The app used to be called Morph Timer: move anything it saved under the old names, once.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('morph-timer:')) continue
    const renamed = 'dorotimer:' + key.slice('morph-timer:'.length)
    if (localStorage.getItem(renamed) === null) localStorage.setItem(renamed, localStorage.getItem(key)!)
    localStorage.removeItem(key)
  }
} catch {
  // Storage can be refused (private windows): then there's nothing to move.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
