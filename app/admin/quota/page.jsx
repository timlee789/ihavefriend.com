'use client';

/**
 * /admin/quota — token quota dashboard (Task 66).
 *
 * Tim-only (gated server-side via ADMIN_USER_IDS env or role='admin').
 * Lets the operator:
 *   • see lifetime token usage per user with progress %
 *   • flip tier (free / premium / unlimited)
 *   • edit the per-user free_token_limit (Enter or blur to commit)
 *   • +50K shortcut button for quickly unblocking a senior
 *   • Sync — recompute lifetime_tokens_used from api_usage_logs
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const TIERS = ['free', 'premium', 'unlimited'];

export default function AdminQuotaPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultLimit, setDefaultLimit] = useState(100000);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) { router.replace('/login'); return; }
    try {
      const res = await fetch('/api/admin/quota', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setError('관리자만 접근 가능 / Admin only');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
      if (data.default_free_limit) setDefaultLimit(Number(data.default_free_limit));
    } catch (e) {
      setError(e?.message || 'load failed');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function patchUser(userId, body) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/quota/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Update failed: ${j.error || res.status}`);
      return;
    }
    await load();
  }

  if (loading) return <div style={{ ...page, padding: 40 }}>Loading…</div>;
  if (error)   return <div style={{ ...page, padding: 40, color: '#fca5a5' }}>{error}</div>;

  return (
    <div style={page}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>🛠️ Admin — Token Quota</h1>
          <button style={btnSecondary} onClick={() => router.push('/admin')}>← Admin Home</button>
        </header>

        <div style={summaryCard}>
          <strong>Default free limit:</strong> {defaultLimit.toLocaleString()} tokens
          <span style={{ color: '#aaa', marginLeft: 12, fontSize: 13 }}>
            (set via FREE_TOKEN_LIMIT env; per-user limit overrides below)
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#2a2520' }}>
                <th style={th}>ID</th>
                <th style={th}>Email</th>
                <th style={th}>Tier</th>
                <th style={th}>Used</th>
                <th style={th}>Limit</th>
                <th style={th}>%</th>
                <th style={th}>Sessions</th>
                <th style={th}>Frags</th>
                <th style={th}>Books</th>
                <th style={th}>Blocked</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const used = Number(u.lifetime_tokens_used || 0);
                const limit = Number(u.free_token_limit || defaultLimit);
                const isUnlimited = u.tier === 'unlimited' || u.tier === 'premium';
                const pctNum = isUnlimited ? -1 : (limit > 0 ? Math.round((used / limit) * 100) : 0);
                const pctLabel = isUnlimited ? '∞' : `${pctNum}%`;
                const isBlocked = !!u.quota_blocked_at;
                const pctColor =
                  isBlocked   ? '#ef4444' :
                  isUnlimited ? '#22c55e' :
                  pctNum >= 80 ? '#f59e0b' :
                  '#fdfdfd';
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #333' }}>
                    <td style={td}>{u.id}</td>
                    <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</td>
                    <td style={td}>
                      <select
                        value={u.tier || 'free'}
                        onChange={e => patchUser(u.id, { tier: e.target.value })}
                        style={selectStyle}
                      >
                        {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td style={td}>{used.toLocaleString()}</td>
                    <td style={td}>
                      <input
                        type="number"
                        defaultValue={limit}
                        key={`limit-${u.id}-${limit}`}
                        style={inputStyle}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        onBlur={e => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== limit) patchUser(u.id, { free_token_limit: v });
                        }}
                      />
                    </td>
                    <td style={{ ...td, color: pctColor, fontWeight: 600 }}>{pctLabel}</td>
                    <td style={td}>{u.session_count}</td>
                    <td style={td}>{u.fragment_count}</td>
                    <td style={td}>{u.active_books}</td>
                    <td style={td}>{isBlocked ? '🔴' : '✓'}</td>
                    <td style={{ ...td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        style={btnPrimary}
                        title="Add 50,000 tokens to free_token_limit (and unblock)"
                        onClick={() => patchUser(u.id, { free_token_limit: limit + 50000 })}
                      >+50K</button>
                      <button
                        style={btnSecondary}
                        title="Recompute lifetime_tokens_used from api_usage_logs"
                        onClick={() => patchUser(u.id, { sync: true })}
                      >Sync</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const page = { background: '#1a1410', color: '#fdfdfd', minHeight: '100vh', padding: 24, fontFamily: 'inherit' };
const summaryCard = { padding: 16, background: '#2a2520', borderRadius: 12, marginBottom: 24 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #444', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', verticalAlign: 'middle' };
const selectStyle = { background: '#1a1410', color: '#fdfdfd', border: '1px solid #444', padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' };
const inputStyle  = { width: 110, background: '#1a1410', color: '#fdfdfd', border: '1px solid #444', padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' };
const btnPrimary   = { background: '#ea580c', color: 'white', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const btnSecondary = { background: 'transparent', color: '#fdfdfd', border: '1px solid #555', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 };
