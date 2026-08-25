// App Router file convention — auto-generates the apple-touch-icon <link>
// tag via ImageResponse. Apple's convention wants a full-bleed icon (no
// transparent corners — iOS applies its own rounded-square mask), so unlike
// icon.tsx this fills the whole 180x180 canvas with the brand color and
// centers the glyph-only mark (no background rect) inside it.
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
      <svg width="112" height="112" viewBox="0 0 64 64">
        <g fill="none" stroke="#ffffff" strokeWidth={8} strokeLinecap="square">
          <line x1="17" y1="19" x2="47" y2="19" />
          <line x1="17" y1="45" x2="47" y2="45" />
          <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
        </g>
      </svg>
    </div>,
    { ...size },
  );
}
