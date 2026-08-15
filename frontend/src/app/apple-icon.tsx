// App Router file convention — auto-generates the apple-touch-icon <link>
// tag via ImageResponse. Apple's convention wants a full-bleed icon (no
// transparent corners — iOS applies its own rounded-square mask), so unlike
// icon.tsx this fills the whole 180x180 canvas with the brand color instead
// of an inset rounded square.
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
      <span
        style={{
          color: '#ffffff',
          fontSize: 100,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </span>
    </div>,
    { ...size },
  );
}
