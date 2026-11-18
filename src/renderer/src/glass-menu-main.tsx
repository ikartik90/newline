import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GlassMenuPage } from './components/glass-menu-page'
import './assets/main.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlassMenuPage />
  </StrictMode>
)
