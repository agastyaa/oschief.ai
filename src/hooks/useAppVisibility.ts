import { useState, useEffect } from 'react'
import { isElectron, getElectronAPI } from '@/lib/electron-api'

/**
 * Track whether the app window is currently visible to the user.
 * Uses the main process power:mode-changed IPC + browser Page Visibility API as fallback.
 *
 * Components can use this to pause non-critical work (timers, polling, animations)
 * when the app is hidden — reducing CPU/GPU usage when nobody is looking.
 *
 * Recording pipeline should NEVER be paused based on this — only UI-cosmetic timers.
 */
export function useAppVisibility(): { isAppHidden: boolean; powerMode: string } {
  const [isAppHidden, setIsAppHidden] = useState(false)
  const [powerMode, setPowerMode] = useState('ac')

  useEffect(() => {
    const api = getElectronAPI()

    if (api?.app?.onPowerModeChanged) {
      // Electron: listen for main process visibility + power state changes
      const cleanup = api.app.onPowerModeChanged((data) => {
        setIsAppHidden(data.hidden ?? false)
        setPowerMode(data.mode ?? (data.onBattery ? 'battery' : 'ac'))
      })
      return cleanup
    }

    // Fallback for non-Electron (dev in browser): use Page Visibility API
    const handleVisibility = () => {
      setIsAppHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return { isAppHidden, powerMode }
}
