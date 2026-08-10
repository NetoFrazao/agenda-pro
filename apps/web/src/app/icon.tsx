import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon Graphite — ink + mint mark “A”. */
export default function Icon() {
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
          borderRadius: 8,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#2dd4a8',
            letterSpacing: -1,
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
