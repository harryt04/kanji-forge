import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const LEVEL_COLORS = ['#d9d2c3', '#e8b23d', '#6b9950', '#3d5a9e', '#1e1b18']

// Deliberately avoids the Google-hosted brand fonts (Fraunces/Klee One) — the
// edge OG-image runtime can't reach an external font host reliably, and a
// system sans stays legible at social-card scale regardless.
export default function OpengraphImage(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f4ec',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
        {LEVEL_COLORS.map((color) => (
          <div
            key={color}
            style={{
              width: 56,
              height: 56,
              borderRadius: 10,
              background: color,
              ...(color === '#d9d2c3'
                ? { boxShadow: 'inset 0 0 0 1px rgba(43,38,32,0.35)' }
                : {}),
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 84,
          fontWeight: 700,
          color: '#211c16',
        }}
      >
        Kanji<span style={{ color: '#b23a2e' }}>Forge</span>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 32,
          color: '#7d7264',
          marginTop: 16,
        }}
      >
        Your whole deck, as a wall of color.
      </div>
    </div>,
    { ...size },
  )
}
