import { useEffect, useState } from 'react'

/** Whether the window fills the screen, as main reports it. */
export function useFullScreen(): boolean {
  const [fullScreen, setFullScreen] = useState(false)

  useEffect(() => {
    // A change heard before the first answer arrives is the newer news.
    let heard = false
    const unsubscribe = window.api.window.onFullScreenChange((next) => {
      heard = true
      setFullScreen(next)
    })
    void window.api.window.isFullScreen().then((current) => {
      if (!heard) setFullScreen(current)
    })
    return unsubscribe
  }, [])

  return fullScreen
}
