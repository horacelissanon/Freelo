// See icon-192.png/route.tsx — same reasoning, larger canvas. Also used as
// the manifest's `purpose: 'maskable'` icon: the "F" sits well within the
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
      <span
        style={{
          color: '#ffffff',
          fontSize: 280,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </span>
    </div>,
    { width: 512, height: 512 },
  );
}
