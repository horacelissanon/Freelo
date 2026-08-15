// App Router file convention — auto-generates the favicon <link> tag via
// ImageResponse (next/og), no static image file needed. Reuses the exact
// mark used everywhere else in the app (header, sidebar, footer): a
// --color-primary rounded square with a bold white "F".
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#059669',
        borderRadius: 7,
      }}
    >
      <span
        style={{
          color: '#ffffff',
          fontSize: 20,
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
