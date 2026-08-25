// See icon-192.png/route.tsx — same reasoning, larger canvas. Also used as
// the manifest's `purpose: 'maskable'` icon: the glyph sits well within the
// safe zone any OS mask would crop to, so one image serves both entries.
import { ImageResponse } from 'next/og';

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#059669',
      }}
    >
      <svg width="320" height="320" viewBox="0 0 64 64">
        <g fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="square">
          <line x1="17" y1="19" x2="47" y2="19" />
          <line x1="17" y1="45" x2="47" y2="45" />
          <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
        </g>
      </svg>
    </div>,
    { width: 512, height: 512 },
  );
}
