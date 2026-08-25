// App Router file convention — auto-generates the favicon <link> tag via
// ImageResponse (next/og), no static image file needed. Reuses the exact
// mark used everywhere else in the app (header, sidebar, footer): the
// ZeFacto "icône complète" mark (rounded #059669 square + white 3-line Z).
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
      }}
    >
      <svg width="32" height="32" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="#059669" />
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
