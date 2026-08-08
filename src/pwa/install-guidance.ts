'use client'

export interface InstallGuidanceEnvironment {
  readonly userAgent: string
  readonly maxTouchPoints: number
  readonly standalone: boolean
}

/** iPadOS can identify itself as desktop Safari, so touch points matter too. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return (
    /iPad|iPhone|iPod/u.test(userAgent) ||
    (/Macintosh/u.test(userAgent) && maxTouchPoints > 1)
  )
}

export function shouldShowIosInstallGuidance(
  environment: InstallGuidanceEnvironment,
): boolean {
  return isIosDevice(environment.userAgent, environment.maxTouchPoints)
    ? !environment.standalone
    : false
}

/** Reads the browser's current display mode without making SSR assumptions. */
export function readInstallGuidanceEnvironment(): InstallGuidanceEnvironment {
  if (typeof navigator === 'undefined') {
    return { userAgent: '', maxTouchPoints: 0, standalone: false }
  }

  const safariNavigator = navigator as Navigator & { standalone?: boolean }
  const displayModeStandalone =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches

  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: displayModeStandalone || safariNavigator.standalone === true,
  }
}
