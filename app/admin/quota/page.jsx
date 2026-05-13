'use client';

/**
 * /admin/quota — token quota dashboard (Task 66 + Sprint 2j V2).
 *
 * Tim-only (gated server-side via ADMIN_USER_IDS env or role='admin').
 * Lets the operator:
 *   • [Tier Defaults section, Sprint 2j V2] — edit per-tier defaults
 *     (free / premium / unlimited) for every quota field
 *   • [Users table] — flip tier, edit free_token_limit
 *   • [▶ Overrides per row, Sprint 2j V2] — per-user override of every
 *     quota field (NULL = use tier default)
 *   • Sync — recompute lifetime_tokens_used from api_usage_logs
 *   • +50K shortcut for quickly unblocking a senior
 */

import { Fragment, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const TIERS = ['free', 'premium', 'unlimited'];

const NUMERIC_OVERRIDE_KEYS = [
  'daily_minutes', 'monthly_minutes',
  'max_fragments', 'max_photos', 'max_books',
  'data_retention_days',
];
// Sprint 2V (2026-05-13) — allow_book_print 추가 (Lulu 인쇄 발주 gate).
const BOOL_OVERRIDE_KEYS = ['allow_pdf', 'allow_audio_qr', 'allow_sharing', 'allow_book_print'];
const ALL_OVERRIDE_KEYS = [...NUMERIC_OVERRIDE_KEYS, ...BOOL_OVERRIDE_KEYS];

export default function AdminQuotaPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [tierDefaults, setTierDefaults] = useState([]); // [{tier, daily_minutes, ...}]
  const [loading, setLoading] = useState(true);
  const [defaultLimit, setDefaultLimit] = useState(100000);
  const [error, setError] = useState('');
  // Per-row local edit buffer for tier defaults (one buffer per tier).
  const [tierEdits, setTierEdits] = useState({});
  // Expanded user rows (showing overrides panel).
  const [expanded, setExpanded] = useState({});

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
      setTierDefaults(data.tier_defaults || []);
      if (data.default_free_limit) setDefaultLimit(Number(data.default_free_limit));
      // Initialize tier edit buffers with current values.
      const buf = {};
      for (const td of (data.tier_defaults || [])) {
        buf[td.tier] = { ...td };
      }
      setTierEdits(buf);
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

  async function patchTierDefaults(tier) {
    const buf = tierEdits[tier];
    if (!buf) return;
    const body = {};
    for (const k of NUMERIC_OVERRIDE_KEYS) {
      const v = Number(buf[k]);
      if (Number.isFinite(v)) body[k] = v;
    }
    for (const k of BOOL_OVERRIDE_KEYS) body[k] = !!buf[k];

    const token = localStorage.getItem('token');
    const res = await fetch(`/api/admin/tier-defaults/${tier}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Tier defaults update failed: ${j.error || res.status}`);
      return;
    }
    await load();
  }

  function tierDefaultOf(tier) {
    return tierDefaults.find(td => td.tier === tier);
  }

  function toggleExpand(userId) {
    setExpanded(p => ({ ...p, [userId]: !p[userId] }));
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

        {/* ═════ Tier Defaults — Sprint 2j V2 ═════ */}
        <section style={tierDefaultsCard}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Tier Defaults</h2>
          <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 12px' }}>
            Per-tier defaults. Edit then click 저장 — affects all users of that tier
            who don&apos;t have a personal override (NULL on user_limits).
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...tableStyle, minWidth: 1000 }}>
              <thead>
                <tr style={{ background: '#2a2520' }}>
                  <th style={th}>Tier</th>
                  <th style={th}>일 분</th>
                  <th style={th}>월 분</th>
                  <th style={th}>Fragment</th>
                  <th style={th}>Photo</th>
                  <th style={th}>Book</th>
                  <th style={th}>PDF</th>
                  <th style={th}>Audio QR</th>
                  <th style={th}>Share</th>
                  <th style={th}>보존일</th>
                  <th style={th}>저장</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map(t => {
                  const buf = tierEdits[t] || {};
                  const setVal = (k, v) => setTierEdits(p => ({ ...p, [t]: { ...(p[t] || {}), [k]: v } }));
                  return (
                    <tr key={t} style={{ borderBottom: '1px solid #333' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{t}</td>
                      {NUMERIC_OVERRIDE_KEYS.slice(0, 5).map(k => (
                        <td style={td} key={k}>
                          <input
                            type="number"
                            value={buf[k] ?? ''}
                            onChange={e => setVal(k, e.target.value)}
                            style={smallInputStyle}
                          />
                        </td>
                      ))}
                      {BOOL_OVERRIDE_KEYS.map(k => (
                        <td style={td} key={k}>
                          <input
                            type="checkbox"
                            checked={!!buf[k]}
                            onChange={e => setVal(k, e.target.checked)}
                          />
                        </td>
                      ))}
                      <td style={td}>
                        <input
                          type="number"
                          value={buf.data_retention_days ?? ''}
                          onChange={e => setVal('data_retention_days', e.target.value)}
                          style={smallInputStyle}
                        />
                      </td>
                      <td style={td}>
                        <button style={btnPrimary} onClick={() => patchTierDefaults(t)}>저장</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ═════ Users — existing table + Overrides expand ═════ */}
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
                const tierDefault = tierDefaultOf(u.tier || 'free') || {};
                return (
                  <Fragment key={u.id}>
                    <tr style={{ borderBottom: '1px solid #333' }}>
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
                        <button
                          style={btnSecondary}
                          title="Toggle per-user override panel"
                          onClick={() => toggleExpand(u.id)}
                        >{expanded[u.id] ? '▼' : '▶'} Overrides</button>
                      </td>
                    </tr>
                    {expanded[u.id] && (
                      <tr style={{ background: '#22191a' }}>
                        <td colSpan={11} style={{ padding: '14px 16px' }}>
                          <UserOverridesPanel
                            user={u}
                            tierDefault={tierDefault}
                            onPatch={(body) => patchUser(u.id, body)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// User Overrides Panel — Sprint 2j V2
//   Per-user override of every quota field. Empty value = clear override
//   (revert to tier default, sent as explicit null to PATCH endpoint).
//   Placeholder shows the tier default so admin knows what the fallback is.
// ─────────────────────────────────────────────────────────────────
function UserOverridesPanel({ user, tierDefault, onPatch }) {
  // Local editable buffer — initialize from user's current overrides.
  const [buf, setBuf] = useState(() => {
    const b = {};
    for (const k of ALL_OVERRIDE_KEYS) b[k] = user[k];
    return b;
  });

  function commit(key, raw) {
    const isNumeric = NUMERIC_OVERRIDE_KEYS.includes(key);
    let val;
    if (raw === '' || raw === undefined || raw === null) {
      val = null;  // explicit null → clear override
    } else if (isNumeric) {
      val = Number(raw);
      if (!Number.isFinite(val)) return;
    } else {
      val = Boolean(raw);
    }
    onPatch({ [key]: val });
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 10 }}>
        Per-user overrides. Leave blank to use tier default
        ({user.tier || 'free'} — shown as placeholder).
        Bool: unchecked + Save uses tier default; checked overrides to true.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {NUMERIC_OVERRIDE_KEYS.map(k => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: '#ccc', marginBottom: 4 }}>{k}</span>
            <input
              type="number"
              value={buf[k] ?? ''}
              placeholder={`default ${tierDefault[k] ?? '?'}`}
              onChange={e => setBuf(p => ({ ...p, [k]: e.target.value }))}
              onBlur={e => {
                const newVal = e.target.value === '' ? null
                  : (Number(e.target.value) === Number(user[k]) ? undefined : e.target.value);
                if (newVal !== undefined) commit(k, e.target.value);
              }}
              style={inputStyle}
            />
          </label>
        ))}
        {BOOL_OVERRIDE_KEYS.map(k => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: '#ccc', marginBottom: 4 }}>
              {k} {tierDefault[k] !== undefined && (
                <span style={{ color: '#888' }}>(default: {tierDefault[k] ? '✓' : '✗'})</span>
              )}
            </span>
            <select
              value={buf[k] === null || buf[k] === undefined ? '' : (buf[k] ? 'true' : 'false')}
              onChange={e => {
                const v = e.target.value;
                const newVal = v === '' ? null : v === 'true';
                setBuf(p => ({ ...p, [k]: newVal }));
                commit(k, newVal);
              }}
              style={selectStyle}
            >
              <option value="">— tier default —</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

const page = { background: '#1a1410', color: '#fdfdfd', minHeight: '100vh', padding: 24, fontFamily: 'inherit' };
const summaryCard = { padding: 16, background: '#2a2520', borderRadius: 12, marginBottom: 24 };
const tierDefaultsCard = { padding: 16, background: '#2a2520', borderRadius: 12, marginBottom: 24, border: '1px solid rgba(251,146,60,0.3)' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 };
const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #444', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', verticalAlign: 'middle' };
const selectStyle = { background: '#1a1410', color: '#fdfdfd', border: '1px solid #444', padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' };
const inputStyle  = { width: 110, background: '#1a1410', color: '#fdfdfd', border: '1px solid #444', padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' };
const smallInputStyle = { width: 80, background: '#1a1410', color: '#fdfdfd', border: '1px solid #444', padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit' };
const btnPrimary   = { background: '#ea580c', color: 'white', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 };
const btnSecondary = { background: 'transparent', color: '#fdfdfd', border: '1px solid #555', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 };
