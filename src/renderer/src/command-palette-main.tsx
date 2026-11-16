import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CommandPalette } from './components/command-palette'
import './assets/main.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CommandPalette />
  </StrictMode>
)
