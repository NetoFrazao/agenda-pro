import { ImageResponse } from 'next/og';

export const alt = 'Agenda Pro — agenda online para barbeiros e manicures';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Open Graph — identidade Graphite (ink / mint / paper). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(160deg, #0e1110 0%, #141a18 50%, #0e1110 100%)',
          color: '#f4f6f3',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          Agenda
          <span style={{ color: '#2dd4a8' }}>Pro</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: -1.5,
              lineHeight: 1.15,
            }}
          >
            Sua agenda, no ritmo certo.
          </div>
          <div style={{ fontSize: 24, color: 'rgba(244,246,243,0.55)', lineHeight: 1.4 }}>
            Link público, lembretes no WhatsApp e sinal via PIX.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 18,
            color: '#d4b483',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Graphite Studio
        </div>
      </div>
    ),
    { ...size },
  );
}
