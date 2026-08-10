import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon — ink + mint mark. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e1110',
          borderRadius: 40,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: '#2dd4a8',
            letterSpacing: -4,
            lineHeight: 1,
          }}
        >
          A
        </div>
      </div>
    ),
    { ...size },
  );
}
