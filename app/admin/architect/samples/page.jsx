'use client';

/**
 * /admin/architect/samples — Tim 시나리오 관리 (admin only)
 *
 * Lists every blueprint_samples row (active + inactive). Each row offers:
 *   - inline is_active toggle (PATCH)
 *   - "수정" → /admin/architect/samples/[id]
 *   - "삭제" → confirm + DELETE
 *
 * "+ 새 시나리오" → /admin/architect/samples/new
 *
 * Style follows app/admin/page.js — inline `S` style object, dark
 * dashboard theme. No CSS module so the admin surface stays
 * self-contained.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSamplesListPage() {
  const router = useRouter();
  const [token, setToken]     = useState('');
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // sample id being mutated
  const [msg, setMsg]         = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') { router.push('/login'); return; }
    setToken(t);
    loadSamples(t);
  }, [router]);

  async function loadSamples(t) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/architect/samples', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSamples(data.samples || []);
      }
    } catch {}
    setLoading(false);
  }

  function flashMsg(m) {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  }

  async function toggleActive(id, isActive) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/architect/samples/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (res.ok) {
        flashMsg(isActive ? '비활성화됨' : '활성화됨');
        loadSamples(token);
      } else {
        flashMsg('변경 실패');
      }
    } catch {
      flashMsg('변경 실패');
    }
    setBusy(null);
  }

  async function handleDelete(id, label) {
    if (!confirm(`정말 "${label}" 시나리오를 삭제할까요?\n\n사용 중인 자서전의 source_sample_id 는 NULL 로 자동 처리됩니다 (book 자체는 안 지워짐).`)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/architect/samples/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        flashMsg('삭제됨');
        loadSamples(token);
      } else {
        const data = await res.json().catch(() => ({}));
        flashMsg(data?.error || '삭제 실패');
      }
    } catch {
      flashMsg('삭제 실패');
    }
    setBusy(null);
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <button style={S.backBtn} onClick={() => router.push('/admin')}>‹ 관리자 홈</button>
          <h1 style={S.title}>📚 시나리오 관리</h1>
          <p style={S.subtitle}>Architect Bot V2 — Blueprint Samples</p>
        </div>
        <button style={S.primaryBtn} onClick={() => router.push('/admin/architect/samples/new')}>
          + 새 시나리오
        </button>
      </div>

      {msg && <div style={S.toast}>{msg}</div>}

      <div style={S.card}>
        {loading ? (
          <p style={S.loading}>불러오는 중…</p>
        ) : samples.length === 0 ? (
          <p style={S.loading}>시나리오가 없습니다.</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['ID', '이름', '언어', '챕터', '순서', '상태', '관리'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {samples.map(sm => (
                  <tr key={sm.id} style={S.tr}>
                    <td style={{ ...S.td, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: '#94a3b8', fontSize: 13 }}>{sm.id}</td>
                    <td style={S.td}>{sm.display_label}</td>
                    <td style={S.td}>{sm.language}</td>
                    <td style={S.td}>{sm.chapter_count}</td>
                    <td style={S.td}>{sm.sort_order}</td>
                    <td style={S.td}>
                      <span style={{
                        ...S.badge,
                        background: sm.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: sm.is_active ? '#10b981' : '#ef4444',
                      }}>
                        {sm.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <button
                        style={S.editBtn}
                        onClick={() => router.push(`/admin/architect/samples/${encodeURIComponent(sm.id)}`)}
                        disabled={busy === sm.id}
                      >수정</button>
                      <button
                        style={{
                          ...S.toggleBtn,
                          background: sm.is_active ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                          color: sm.is_active ? '#ef4444' : '#10b981',
                        }}
                        onClick={() => toggleActive(sm.id, sm.is_active)}
                        disabled={busy === sm.id}
                      >
                        {sm.is_active ? '비활성' : '활성'}
                      </button>
                      <button
                        style={S.deleteBtn}
                        onClick={() => handleDelete(sm.id, sm.display_label)}
                        disabled={busy === sm.id}
                      >삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={S.infoBox}>
        <strong>안내:</strong> 시나리오는 자서전 만들기의 시작점입니다. 비활성화하면
        사용자 페이지 (/architect/sample/N) 에서 보이지 않지만 데이터는 보존됩니다.
        삭제 시 이 시나리오로 이미 시작한 자서전의 <code>source_sample_id</code> 는
        NULL 로 자동 처리됩니다 (책 자체는 안 지워짐).
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#0f0f1a', padding: '28px 24px', maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16 },
  backBtn: { background: 'transparent', border: 'none', color: '#7c3aed', fontSize: 14, cursor: 'pointer', padding: '4px 0', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: 700, color: '#e2e8f0', margin: '0 0 4px' },
  subtitle: { color: '#64748b', fontSize: 13, margin: 0 },
  primaryBtn: { background: 'linear-gradient(135deg,#fb923c,#ea580c)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  toast: { background: '#10b981', color: '#fff', borderRadius: 10, padding: '10px 20px', marginBottom: 20, fontWeight: 600, textAlign: 'center' },
  card: { background: '#16213e', borderRadius: 16, padding: '20px', border: '1px solid #2a2a4a', marginBottom: 20, overflowX: 'auto' },
  loading: { color: '#64748b', fontSize: 15, padding: '24px 0', textAlign: 'center' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 720 },
  th: { textAlign: 'left', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 12px', borderBottom: '1px solid #2a2a4a' },
  tr: { borderBottom: '1px solid #1e2a3a' },
  td: { padding: '12px 12px', color: '#e2e8f0', fontSize: 14, verticalAlign: 'middle' },
  badge: { borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  editBtn: { background: 'rgba(124,58,237,0.15)', color: '#a855f7', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 },
  toggleBtn: { borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', border: 'none', marginRight: 6 },
  deleteBtn: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  infoBox: { background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, padding: '16px 20px', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 },
};
