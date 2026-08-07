'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

export default function FpsOverlay({
  canvasRef,
}: {
  canvasRef?: RefObject<HTMLCanvasElement | null>
}): ReactNode {
  const [fps, setFps] = useState(0)
  const [avgFrameTime, setAvgFrameTime] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const frameTimesRef = useRef<number[]>([])
  const lastFrameTimeRef = useRef(performance.now())
  const rafIdRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const canvas = canvasRef?.current
    if (!canvas) return

    const handlePointerDown = () => setIsPanning(true)
    const handlePointerUp = () => {
      setIsPanning(false)
      frameTimesRef.current = []
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)

    const trackFrame = () => {
      const now = performance.now()
      const frameTime = now - lastFrameTimeRef.current
      lastFrameTimeRef.current = now

      frameTimesRef.current.push(frameTime)
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift()
      }

      if (frameTimesRef.current.length > 0) {
        const avgTime =
          frameTimesRef.current.reduce((a, b) => a + b, 0) /
          frameTimesRef.current.length
        setAvgFrameTime(Math.round(avgTime * 10) / 10)
        setFps(Math.round(1000 / avgTime))
      }

      rafIdRef.current = requestAnimationFrame(trackFrame)
    }

    rafIdRef.current = requestAnimationFrame(trackFrame)

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [canvasRef])

  return (
    <div className="bg-card border-border fixed top-4 right-4 rounded-lg border p-3 font-mono text-xs shadow-lg">
      <div className="text-foreground mb-2 font-bold">Performance</div>
      <div className="space-y-1">
        <div
          className={
            isPanning ? 'text-primary font-bold' : 'text-muted-foreground'
          }
        >
          FPS: <span className="font-bold">{fps}</span>
          {isPanning && ' (panning)'}
        </div>
        <div className="text-muted-foreground">
          Frame: <span className="font-bold">{avgFrameTime}ms</span>
        </div>
      </div>
      <div className="text-muted-foreground border-border mt-3 border-t pt-2 pb-2 text-xs">
        {fps >= 50 ? (
          <div className="text-success">✓ Gate pass (≥50fps)</div>
        ) : (
          <div className="text-destructive">✗ Below target</div>
        )}
      </div>
    </div>
  )
}
