// Dedicated Route Handler (not the special icon.tsx convention) so the URL
// is a stable, explicit /icon-192.png that app/manifest.ts's icons array
// can reference directly. Full-bleed background — same reasoning as
// apple-icon.tsx — so it also works as the manifest's maskable-adjacent
// fallback if a platform ignores `purpose`.
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
          fontSize: 108,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </span>
    </div>,
    { width: 192, height: 192 },
  );
}
