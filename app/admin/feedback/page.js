'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  bg: '#FFFCF8', surface: '#FFFFFF', border: '#F0EBE3',
  text: '#1C1917', muted: '#78716C', coral: '#F97316',
  green: '#16A34A', star: '#F59E0B',
};

export default function FeedbackAdminPage() {
  const router  = useRouter();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') { router.push('/login'); return; }
    fetch('/api/feedback', { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError('Failed to load: ' + e); setLoading(false); });
  }, [router]);

  if (loading) return <div style={S.loading}>Loading...</div>;
  if (error)   return <div style={S.loading}>{error}</div>;

  const { stats, feedback } = data;
  const avg = stats.avg_rating ?? 0;
  const total = stats.total ?? 0;

  return (
    <div style={S.page}>
      {/* header */}
      <div style={S.topBar}>
        <button style={S.back} onClick={() => router.push('/admin')}>← Admin</button>
        <h1 style={S.title}>⭐ Feedback</h1>
      </div>

      {/* summary card */}
      <div style={S.card}>
        <div style={S.statRow}>
          <div style={S.bigStat}>
            <span style={S.bigNum}>{avg.toFixed(1)}</span>
            <Stars value={avg} />
            <span style={S.bigLabel}>{total} reviews</span>
          </div>
          <div style={S.barChart}>
            {[5, 4, 3, 2, 1].map(n => {
              const count = stats[['','one','two','three','four','five'][n] + '_star'] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={n} style={S.barRow}>
                  <span style={S.barLabel}>{n}★</span>
                  <div style={S.barTrack}>
                    <div style={{ ...S.barFill, width: `${pct}%` }} />
                  </div>
                  <span style={S.barCount}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* comments list */}
      <div style={S.card}>
        <h2 style={S.sectionTitle}>Recent Feedback ({feedback.length})</h2>
        {feedback.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No feedback yet.</p>}
        {feedback.map(f => (
          <div key={f.id} style={S.feedItem}>
            <div style={S.feedTop}>
              <Stars value={f.rating} small />
              <span style={S.feedUser}>{f.name || f.email}</span>
              <span style={S.feedDate}>{f.created_at}</span>
            </div>
            {f.comment && <p style={S.feedComment}>"{f.comment}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stars({ value, small }) {
  const size = small ? 14 : 22;
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2l2.6 5.4 5.9.9-4.3 4.2 1 5.9L12 15.8l-5.2 2.6 1-5.9L3.5 8.3l5.9-.9z"
            fill={n <= Math.round(value) ? C.star : '#E5E7EB'}
          />
        </svg>
      ))}
    </div>
  );
}

const S = {
  page:    { minHeight: '100vh', background: C.bg, padding: '0 0 40px' },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.muted },
  topBar:  { display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px 12px', borderBottom: `1px solid ${C.border}`, background: C.surface },
  back:    { background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 },
  title:   { margin: 0, fontSize: 18, fontWeight: 700, color: C.text },
  card:    { margin: '16px 16px 0', background: C.surface, borderRadius: 16, padding: '20px', border: `1px solid ${C.border}` },
  statRow: { display: 'flex', gap: 24, alignItems: 'center' },
  bigStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90 },
  bigNum:  { fontSize: 48, fontWeight: 800, color: C.text, lineHeight: 1 },
  bigLabel:{ fontSize: 12, color: C.muted, marginTop: 4 },
  barChart:{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 },
  barRow:  { display: 'flex', alignItems: 'center', gap: 8 },
  barLabel:{ fontSize: 12, color: C.muted, width: 24, textAlign: 'right' },
  barTrack:{ flex: 1, height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: C.star, borderRadius: 4, transition: 'width 0.4s ease' },
  barCount:{ fontSize: 12, color: C.muted, width: 24 },
  sectionTitle: { margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: C.text },
  feedItem:{ padding: '12px 0', borderBottom: `1px solid ${C.border}` },
  feedTop: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  feedUser:{ fontSize: 13, fontWeight: 600, color: C.text },
  feedDate:{ fontSize: 11, color: C.muted, marginLeft: 'auto' },
  feedComment: { margin: '8px 0 0', fontSize: 13, color: C.muted, fontStyle: 'italic', lineHeight: 1.5 },
};
