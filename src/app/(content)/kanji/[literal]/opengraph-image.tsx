import { ImageResponse } from 'next/og'
import { getKanji } from '@/lib/seo/kanji-pack'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Deliberately avoids the Google-hosted brand fonts, same reasoning as the
// root `opengraph-image.tsx` — the edge OG-image runtime can't reliably reach
// an external font host.
export default function KanjiOpengraphImage({
  params,
}: {
  params: { literal: string }
}): ImageResponse {
  const literal = decodeURIComponent(params.literal)
  const kanji = getKanji(literal)
  const primaryMeaning = kanji?.meanings[0] ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 64,
          background: '#e8e4dc',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 320,
            color: '#211c16',
            lineHeight: 1,
          }}
        >
          {literal}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 480 }}>
          <div style={{ display: 'flex', fontSize: 44, color: '#211c16' }}>
            {primaryMeaning}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#7d7264',
              marginTop: 16,
            }}
          >
            Kanji<span style={{ color: '#b23a2e' }}>Forge</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
