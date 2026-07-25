'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * FPS counter overlay for performance monitoring.
 * Displays rolling average FPS and frame timing data during pan/zoom.
 */
export default function FpsOverlay(): ReactNode {
  const [fps, setFps] = useState(0);
  const [avgFrameTime, setAvgFrameTime] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    // Detect pan/zoom activity
    const handlePointerDown = () => setIsPanning(true);
    const handlePointerUp = () => {
      setIsPanning(false);
      frameTimesRef.current = [];
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    // Track frame times
    const trackFrame = () => {
      const now = performance.now();
      const frameTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      frameTimesRef.current.push(frameTime);
      // Keep rolling window of last 30 frames
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
      }

      // Update display
      if (frameTimesRef.current.length > 0) {
        const avgTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        setAvgFrameTime(Math.round(avgTime * 10) / 10);
        setFps(Math.round(1000 / avgTime));
      }

      rafIdRef.current = requestAnimationFrame(trackFrame);
    };

    rafIdRef.current = requestAnimationFrame(trackFrame);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerleave', handlePointerUp);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 bg-card border border-border rounded-lg p-3 font-mono text-xs shadow-lg">
      <div className="mb-2 font-bold text-foreground">Performance</div>
      <div className="space-y-1">
        <div className={isPanning ? 'text-primary font-bold' : 'text-muted-foreground'}>
          FPS: <span className="font-bold">{fps}</span>
          {isPanning && ' (panning)'}
        </div>
        <div className="text-muted-foreground">
          Frame: <span className="font-bold">{avgFrameTime}ms</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-3 pb-2 border-t border-border pt-2">
        {fps >= 50 ? (
          <div className="text-success">✓ Gate pass (≥50fps)</div>
        ) : (
          <div className="text-destructive">✗ Below target</div>
        )}
      </div>
    </div>
  );
}
