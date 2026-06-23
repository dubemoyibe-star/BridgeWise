import React, { useState, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type MetricKey = 'successRate' | 'avgLatencyMs' | 'volume' | 'transfers';
type TimeRange = '24h' | '7d' | '30d' | '90d';

interface RouteMetric {
  sourceChain: string;
  destinationChain: string;
  bridge: string;
  successRate: number;   // 0–1
  avgLatencyMs: number;
  volume: number;        // USD
  transfers: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface TrendPoint {
  label: string;
  value: number;
}

// ── Mock data ────────────────────────────────────────────────────────────────

const ROUTES: RouteMetric[] = [
  { sourceChain: 'Stellar',   destinationChain: 'Ethereum', bridge: 'AllBridge', successRate: 0.98, avgLatencyMs: 310, volume: 4_200_000, transfers: 1840, trend: 'improving' },
  { sourceChain: 'Stellar',   destinationChain: 'Polygon',  bridge: 'AllBridge', successRate: 0.96, avgLatencyMs: 260, volume: 2_100_000, transfers: 1120, trend: 'stable' },
  { sourceChain: 'Stellar',   destinationChain: 'Arbitrum', bridge: 'Squid',     successRate: 0.94, avgLatencyMs: 420, volume: 1_300_000, transfers:  640, trend: 'declining' },
  { sourceChain: 'Stellar',   destinationChain: 'BSC',      bridge: 'Squid',     successRate: 0.91, avgLatencyMs: 580, volume:   870_000, transfers:  390, trend: 'declining' },
  { sourceChain: 'Ethereum',  destinationChain: 'Stellar',  bridge: 'AllBridge', successRate: 0.97, avgLatencyMs: 340, volume: 3_800_000, transfers: 1560, trend: 'improving' },
  { sourceChain: 'Polygon',   destinationChain: 'Stellar',  bridge: 'AllBridge', successRate: 0.95, avgLatencyMs: 290, volume: 1_600_000, transfers:  820, trend: 'stable' },
  { sourceChain: 'Arbitrum',  destinationChain: 'Stellar',  bridge: 'Stargate',  successRate: 0.99, avgLatencyMs: 210, volume: 2_400_000, transfers:  970, trend: 'improving' },
  { sourceChain: 'Ethereum',  destinationChain: 'Polygon',  bridge: 'Stargate',  successRate: 0.99, avgLatencyMs: 190, volume: 5_100_000, transfers: 2210, trend: 'improving' },
  { sourceChain: 'Polygon',   destinationChain: 'Arbitrum', bridge: 'Squid',     successRate: 0.93, avgLatencyMs: 470, volume:   760_000, transfers:  310, trend: 'declining' },
  { sourceChain: 'BSC',       destinationChain: 'Ethereum', bridge: 'AllBridge', successRate: 0.96, avgLatencyMs: 380, volume: 1_900_000, transfers:  740, trend: 'stable' },
];

const CHAINS = ['Stellar', 'Ethereum', 'Polygon', 'Arbitrum', 'BSC'];
const BRIDGES = ['All', 'AllBridge', 'Squid', 'Stargate'];

const TREND_POINTS: Record<string, TrendPoint[]> = {
  '24h': [
    { label: '00:00', value: 0.95 }, { label: '04:00', value: 0.96 },
    { label: '08:00', value: 0.94 }, { label: '12:00', value: 0.97 },
    { label: '16:00', value: 0.96 }, { label: '20:00', value: 0.98 },
  ],
  '7d': [
    { label: 'Mon', value: 0.94 }, { label: 'Tue', value: 0.96 },
    { label: 'Wed', value: 0.93 }, { label: 'Thu', value: 0.97 },
    { label: 'Fri', value: 0.96 }, { label: 'Sat', value: 0.95 },
    { label: 'Sun', value: 0.98 },
  ],
  '30d': [
    { label: 'W1', value: 0.93 }, { label: 'W2', value: 0.95 },
    { label: 'W3', value: 0.96 }, { label: 'W4', value: 0.97 },
  ],
  '90d': [
    { label: 'Jan', value: 0.92 }, { label: 'Feb', value: 0.94 },
    { label: 'Mar', value: 0.97 },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function heatColor(normalised: number, metricKey: MetricKey): string {
  // For latency: high value = worse (red). For others: high = better (green).
  const t = metricKey === 'avgLatencyMs' ? 1 - normalised : normalised;
  if (t >= 0.75) return '#16a34a'; // green-600
  if (t >= 0.5)  return '#ca8a04'; // yellow-600
  if (t >= 0.25) return '#ea580c'; // orange-600
  return '#dc2626';                // red-600
}

function cellBg(normalised: number, metricKey: MetricKey): string {
  const t = metricKey === 'avgLatencyMs' ? 1 - normalised : normalised;
  if (t >= 0.75) return '#dcfce7';
  if (t >= 0.5)  return '#fefce8';
  if (t >= 0.25) return '#fff7ed';
  return '#fef2f2';
}

function formatMetric(value: number, key: MetricKey): string {
  if (key === 'successRate') return `${(value * 100).toFixed(1)}%`;
  if (key === 'avgLatencyMs') return `${value} ms`;
  if (key === 'volume') return `$${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}

function normalise(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
}

const TREND_ICON: Record<RouteMetric['trend'], string> = {
  improving: '▲',
  stable: '→',
  declining: '▼',
};
const TREND_COLOR: Record<RouteMetric['trend'], string> = {
  improving: '#16a34a',
  stable: '#64748b',
  declining: '#dc2626',
};

// ── Sub-components ───────────────────────────────────────────────────────────

function HeatmapCell({
  route,
  metricKey,
  norm,
}: {
  route: RouteMetric | null;
  metricKey: MetricKey;
  norm: (v: number) => number;
}) {
  if (!route) {
    return (
      <td style={{
        padding: '10px 8px', textAlign: 'center', fontSize: '12px',
        color: '#cbd5e1', background: '#f8fafc', border: '1px solid #e2e8f0',
      }}>
        —
      </td>
    );
  }

  const raw = route[metricKey] as number;
  const n = norm(raw);
  const bg = cellBg(n, metricKey);
  const fg = heatColor(n, metricKey);

  return (
    <td style={{
      padding: '10px 8px', textAlign: 'center', fontSize: '12px',
      fontWeight: 600, background: bg, border: '1px solid #e2e8f0',
      cursor: 'default', transition: 'opacity 0.15s',
    }}
      title={`${route.bridge} · ${formatMetric(raw, metricKey)}`}
    >
      <span style={{ color: fg }}>{formatMetric(raw, metricKey)}</span>
      <br />
      <span style={{ fontSize: '10px', color: TREND_COLOR[route.trend], fontWeight: 400 }}>
        {TREND_ICON[route.trend]} {route.trend}
      </span>
    </td>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values) - 0.01;
  const max = Math.max(...values) + 0.01;
  const h = 80;
  const w = 320;
  const step = w / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p.value - min) / (max - min)) * h;
    return `${x},${y}`;
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h + 24} style={{ display: 'block' }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = h - t * h;
          return (
            <line key={t} x1={0} y1={y} x2={w} y2={y}
              stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 2" />
          );
        })}
        {/* Area fill */}
        <polygon
          points={`0,${h} ${coords.join(' ')} ${w},${h}`}
          fill="#dbeafe" opacity={0.5}
        />
        {/* Line */}
        <polyline
          points={coords.join(' ')}
          fill="none" stroke="#3b82f6" strokeWidth={2}
        />
        {/* Dots + labels */}
        {points.map((p, i) => {
          const x = i * step;
          const y = h - ((p.value - min) / (max - min)) * h;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3} fill="#3b82f6" />
              <text x={x} y={h + 16} textAnchor="middle"
                fontSize={9} fill="#94a3b8">{p.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '14px 18px', border: '1px solid #e2e8f0', borderRadius: '10px',
      background: '#fff', minWidth: '130px', flex: '1',
    }}>
      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RoutePerformanceHeatmaps() {
  const [metricKey, setMetricKey] = useState<MetricKey>('successRate');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [bridgeFilter, setBridgeFilter] = useState('All');

  const filteredRoutes = useMemo(
    () => ROUTES.filter((r) => bridgeFilter === 'All' || r.bridge === bridgeFilter),
    [bridgeFilter],
  );

  const metricValues = useMemo(
    () => filteredRoutes.map((r) => r[metricKey] as number),
    [filteredRoutes, metricKey],
  );

  const norm = useMemo(() => normalise(metricValues), [metricValues]);

  // Build route lookup for O(1) cell access
  const routeMap = useMemo(() => {
    const m = new Map<string, RouteMetric>();
    filteredRoutes.forEach((r) => m.set(`${r.sourceChain}->${r.destinationChain}`, r));
    return m;
  }, [filteredRoutes]);

  const totalVolume = filteredRoutes.reduce((s, r) => s + r.volume, 0);
  const avgSuccess = filteredRoutes.reduce((s, r) => s + r.successRate, 0) / (filteredRoutes.length || 1);
  const avgLatency = filteredRoutes.reduce((s, r) => s + r.avgLatencyMs, 0) / (filteredRoutes.length || 1);
  const totalTransfers = filteredRoutes.reduce((s, r) => s + r.transfers, 0);

  const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
    { key: 'successRate',  label: 'Success Rate' },
    { key: 'avgLatencyMs', label: 'Avg Latency' },
    { key: 'volume',       label: 'Volume' },
    { key: 'transfers',    label: 'Transfers' },
  ];

  const btnBase: React.CSSProperties = {
    padding: '6px 14px', borderRadius: '6px', fontSize: '13px',
    fontWeight: 500, cursor: 'pointer', border: '1px solid #e2e8f0',
    transition: 'all 0.15s',
  };
  const btnActive: React.CSSProperties = { ...btnBase, background: '#1e40af', color: '#fff', borderColor: '#1e40af' };
  const btnInactive: React.CSSProperties = { ...btnBase, background: '#fff', color: '#374151' };

  return (
    <div style={{ padding: '28px', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1100px', margin: '0 auto', color: '#0f172a' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, margin: '0 0 4px' }}>
          Soroban Route Performance Heatmaps
        </h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
          Visualize cross-chain route performance across bridges and chains
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <SummaryCard label="Total Volume" value={`$${(totalVolume / 1_000_000).toFixed(1)}M`} sub={timeRange} />
        <SummaryCard label="Avg Success Rate" value={`${(avgSuccess * 100).toFixed(1)}%`} />
        <SummaryCard label="Avg Latency" value={`${Math.round(avgLatency)} ms`} />
        <SummaryCard label="Total Transfers" value={totalTransfers.toLocaleString()} />
        <SummaryCard label="Active Routes" value={String(filteredRoutes.length)} />
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center',
        marginBottom: '24px', padding: '14px 16px',
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
      }}>
        {/* Metric selector */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', marginRight: '4px' }}>Metric:</span>
          {METRIC_OPTIONS.map(({ key, label }) => (
            <button key={key} onClick={() => setMetricKey(key)}
              style={metricKey === key ? btnActive : btnInactive}>
              {label}
            </button>
          ))}
        </div>

        {/* Time range */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', marginRight: '4px' }}>Period:</span>
          {(['24h', '7d', '30d', '90d'] as TimeRange[]).map((t) => (
            <button key={t} onClick={() => setTimeRange(t)}
              style={timeRange === t ? btnActive : btnInactive}>
              {t}
            </button>
          ))}
        </div>

        {/* Bridge filter */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', marginRight: '4px' }}>Bridge:</span>
          {BRIDGES.map((b) => (
            <button key={b} onClick={() => setBridgeFilter(b)}
              style={bridgeFilter === b ? btnActive : btnInactive}>
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '28px' }}>
        <div style={{
          padding: '12px 16px', background: '#f1f5f9',
          borderBottom: '1px solid #e2e8f0', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
            Route Matrix — {METRIC_OPTIONS.find((m) => m.key === metricKey)?.label}
          </h2>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            Hover cells for bridge detail · Colour = performance intensity
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 600, border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Source ↓ / Dest →
                </th>
                {CHAINS.map((c) => (
                  <th key={c} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#374151', fontWeight: 600, border: '1px solid #e2e8f0', minWidth: '100px' }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHAINS.map((src) => (
                <tr key={src}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: '13px', background: '#f8fafc', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    {src}
                  </td>
                  {CHAINS.map((dst) => {
                    if (src === dst) {
                      return (
                        <td key={dst} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', textAlign: 'center', color: '#cbd5e1', fontSize: '18px' }}>
                          ●
                        </td>
                      );
                    }
                    const route = routeMap.get(`${src}->${dst}`) ?? null;
                    return <HeatmapCell key={dst} route={route} metricKey={metricKey} norm={norm} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom row: trend chart + top routes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Trend chart */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Avg Success Rate Trend</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>All routes · {timeRange}</p>
          </div>
          <div style={{ padding: '16px' }}>
            <TrendChart points={TREND_POINTS[timeRange]} />
          </div>
        </div>

        {/* Top routes table */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Top Routes by Volume</h2>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '220px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Route', 'Bridge', 'Volume', 'Success'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...filteredRoutes].sort((a, b) => b.volume - a.volume).slice(0, 8).map((r) => (
                  <tr key={`${r.sourceChain}-${r.destinationChain}-${r.bridge}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 500 }}>
                      {r.sourceChain} → {r.destinationChain}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: '12px', color: '#64748b' }}>{r.bridge}</td>
                    <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600 }}>
                      ${(r.volume / 1_000_000).toFixed(1)}M
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: '12px' }}>
                      <span style={{ color: r.successRate >= 0.97 ? '#16a34a' : r.successRate >= 0.94 ? '#ca8a04' : '#dc2626', fontWeight: 600 }}>
                        {(r.successRate * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '16px', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
        <span style={{ fontWeight: 600 }}>Performance scale:</span>
        {[
          { bg: '#dcfce7', fg: '#16a34a', label: 'High' },
          { bg: '#fefce8', fg: '#ca8a04', label: 'Medium' },
          { bg: '#fff7ed', fg: '#ea580c', label: 'Low' },
          { bg: '#fef2f2', fg: '#dc2626', label: 'Critical' },
        ].map(({ bg, fg, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '14px', height: '14px', background: bg, border: `1px solid ${fg}`, borderRadius: '3px', display: 'inline-block' }} />
            <span style={{ color: fg, fontWeight: 600 }}>{label}</span>
          </span>
        ))}
        <span style={{ marginLeft: '12px' }}>
          Trend: <span style={{ color: '#16a34a' }}>▲ improving</span> &nbsp;
          <span style={{ color: '#64748b' }}>→ stable</span> &nbsp;
          <span style={{ color: '#dc2626' }}>▼ declining</span>
        </span>
      </div>
    </div>
  );
}
