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
      <svg width="120" height="120" viewBox="0 0 64 64">
        <g fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="square">
          <line x1="17" y1="19" x2="47" y2="19" />
          <line x1="17" y1="45" x2="47" y2="45" />
          <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
        </g>
      </svg>
    </div>,
    { width: 192, height: 192 },
  );
}
