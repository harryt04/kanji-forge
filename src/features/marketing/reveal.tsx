'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fades a section in once it scrolls into view, using the token-layer
 * `--duration-page-reveal` timing so it collapses to 0ms with everything else
 * under `prefers-reduced-motion` — no separate reduced-motion branch needed here.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  readonly children: React.ReactNode
  readonly className?: string
  readonly delayMs?: number
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] ease-[var(--ease-out)]',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        className,
      )}
      style={{
        transitionDuration: 'var(--duration-page-reveal)',
        transitionDelay: `${delayMs}ms`,
      }}
    >
      {children}
    </div>
  )
}
