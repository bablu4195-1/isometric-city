import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const WIDTH = 1200;
const HEIGHT = 630;

type SkylineTower = {
  width: number;
  height: number;
  colors: [string, string];
  shadow: string;
};

type Metric = {
  label: string;
  value: string;
  detail: string;
};

type SystemChip = {
  label: string;
  detail: string;
};

const skylineTowers: SkylineTower[] = [
  {
    width: 42,
    height: 140,
    colors: ['#9de6ff', '#3b82f6'],
    shadow: 'rgba(59,130,246,0.35)',
  },
  {
    width: 52,
    height: 180,
    colors: ['#7dfcc9', '#0f766e'],
    shadow: 'rgba(16,185,129,0.35)',
  },
  {
    width: 60,
    height: 210,
    colors: ['#c4b5fd', '#7c3aed'],
    shadow: 'rgba(124,58,237,0.35)',
  },
  {
    width: 34,
    height: 125,
    colors: ['#fecdd3', '#f43f5e'],
    shadow: 'rgba(244,63,94,0.35)',
  },
  {
    width: 46,
    height: 170,
    colors: ['#fde68a', '#f59e0b'],
    shadow: 'rgba(245,158,11,0.35)',
  },
  {
    width: 38,
    height: 150,
    colors: ['#bfdbfe', '#2563eb'],
    shadow: 'rgba(37,99,235,0.35)',
  },
];

const systemChips: SystemChip[] = [
  { label: 'Transit', detail: 'Air | Rail | Sea | Road' },
  { label: 'Economy', detail: 'Advisors + overlays' },
  { label: 'Incidents', detail: 'Realtime response' },
  { label: 'Districts', detail: 'Custom zoning' },
];

const metrics: Metric[] = [
  { label: 'Population', value: '1.3M', detail: 'Simulated citizens' },
  { label: 'Transit Lines', value: '24', detail: 'Cars | Rail | Air | Sea' },
  { label: 'Budget', value: 'Cr 842M', detail: 'Advisor managed' },
];

const focusPoints: string[] = [
  'Layered advisors balance budgets & morale',
  'Realtime overlays for traffic, power, and airspace',
  'Handcrafted districts with multi-modal logistics',
];

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          gap: '48px',
          padding: '48px 56px',
          backgroundColor: '#020617',
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(94,234,212,0.35), transparent 55%), radial-gradient(circle at 80% 0%, rgba(56,189,248,0.3), transparent 55%), linear-gradient(125deg, rgba(2,6,23,0.98), rgba(3,7,18,0.98))',
          color: '#f8fafc',
          fontFamily:
            'DM Sans, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          letterSpacing: '-0.01em',
        }}
      >
        <div
          style={{
            display: 'flex',
            flex: 1.2,
            flexDirection: 'column',
            gap: '24px',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                fontSize: '26px',
                letterSpacing: '0.3em',
                color: '#7dd3fc',
                textTransform: 'uppercase',
              }}
            >
              Metropolis Builder
            </div>
            <div
              style={{
                fontSize: '112px',
                fontWeight: 700,
                lineHeight: 0.85,
                display: 'flex',
                gap: '8px',
              }}
            >
              <span>ISO</span>
              <span style={{ color: '#38bdf8' }}>CITY</span>
            </div>
            <div
              style={{
                fontSize: '28px',
                color: '#cbd5f5',
                maxWidth: '640px',
                lineHeight: 1.3,
                display: 'block',
              }}
            >
              A richly detailed isometric simulation with overlapping transport,
              weather, energy, and citizen systems rendered in WebGL.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            {systemChips.map((chip) => (
              <div
                key={chip.label}
                style={{
                  padding: '12px 20px',
                  borderRadius: '999px',
                  border: '1px solid rgba(148,163,184,0.45)',
                  backgroundColor: 'rgba(15,23,42,0.65)',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{chip.label}</span>
                <span style={{ color: '#94a3b8' }}>{chip.detail}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '14px',
              height: '210px',
            }}
          >
            {skylineTowers.map((tower, index) => (
              <div
                key={`tower-${index}`}
                style={{
                  width: `${tower.width}px`,
                  height: `${tower.height}px`,
                  borderRadius: '12px',
                  backgroundImage: `linear-gradient(180deg, ${tower.colors[0]}, ${tower.colors[1]})`,
                  boxShadow: `0 25px 50px ${tower.shadow}`,
                  border: '1px solid rgba(15,23,42,0.6)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '18px',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderBottom: '1px solid rgba(255,255,255,0.2)',
                  }}
                />
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'rgba(15,23,42,0.65)',
                    borderTop: '1px solid rgba(255,255,255,0.12)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: '360px',
            borderRadius: '28px',
            border: '1px solid rgba(148,163,184,0.35)',
            backgroundColor: 'rgba(9,14,29,0.85)',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                color: '#7dd3fc',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
              }}
            >
              City Snapshot
            </div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 600,
              }}
            >
              Live simulation
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {metrics.map((metric) => (
              <div
                key={metric.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  paddingBottom: '14px',
                  borderBottom: '1px solid rgba(148,163,184,0.25)',
                }}
              >
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '14px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.2em',
                  }}
                >
                  {metric.label}
                </div>
                <div style={{ fontSize: '42px', fontWeight: 700, marginTop: '4px' }}>
                  {metric.value}
                </div>
                <div style={{ color: '#cbd5f5', fontSize: '18px' }}>{metric.detail}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {focusPoints.map((item, idx) => (
              <div
                key={item}
                style={{ display: 'flex', gap: '12px', fontSize: '18px', color: '#cbd5f5' }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '999px',
                    marginTop: '7px',
                    backgroundColor: idx % 2 === 0 ? '#34d399' : '#38bdf8',
                  }}
                />
                <span style={{ lineHeight: 1.3 }}>{item}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '16px', color: '#94a3b8' }}>
            React 19 | WebGL renderer | Edge-optimized OG image
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    }
  );
}
