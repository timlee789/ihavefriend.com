'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // user id being edited
  const [limits, setLimits] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') { router.push('/login'); return; }
    setToken(t);
    loadUsers(t);
  }, [router]);

  async function loadUsers(t) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        const lim = {};
        data.forEach(u => { lim[u.id] = { ...u.limits }; });
        setLimits(lim);
      }
    } catch {}
    setLoading(false);
  }

  async function toggleActive(userId, isActive) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, isActive }),
    });
    loadUsers(token);
  }

  async function saveLimits(userId) {
    setSaving(true);
    const l = limits[userId];
    await fetch('/api/admin/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, dailyMinutes: +l.dailyMinutes, monthlyMinutes: +l.monthlyMinutes, memoryKb: +l.memoryKb }),
    });
    setSaving(false);
    setEditing(null);
    setMsg('Limits saved!');
    setTimeout(() => setMsg(''), 2500);
    loadUsers(token);
  }

  function setLimit(userId, field, val) {
    setLimits(prev => ({ ...prev, [userId]: { ...prev[userId], [field]: val } }));
  }

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.isActive).length;
  const totalMonthMinutes = users.reduce((s, u) => s + (u.monthMinutes || 0), 0);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>⚙️ Admin Dashboard</h1>
          <p style={S.subtitle}>AI Companion — User Management</p>
        </div>
        <button style={S.logoutBtn} onClick={() => { localStorage.clear(); router.push('/login'); }}>Logout</button>
      </div>

      {msg && <div style={S.toast}>{msg}</div>}

      {/* Stats */}
      <div style={S.statsRow}>
        <StatCard label="Total Users" value={totalUsers} color="#7c3aed" />
        <StatCard label="Active Users" value={activeUsers} color="#10b981" />
        <StatCard label="Month Minutes Used" value={totalMonthMinutes.toFixed(0)} color="#f59e0b" />
      </div>

      {/* Users table */}
      <div style={S.card}>
        <h2 style={S.sectionTitle}>Users</h2>
        {loading ? (
          <p style={S.loading}>Loading...</p>
        ) : users.length === 0 ? (
          <p style={S.loading}>No users yet.</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Avatar', 'Today', 'Month', 'Memory', 'Daily Limit', 'Month Limit', 'Mem Limit', 'Status', 'Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={S.tr}>
                    <td style={S.td}>{u.name}</td>
                    <td style={{ ...S.td, color: '#94a3b8', fontSize: 13 }}>{u.email}</td>
                    <td style={S.td}>{u.avatarId}</td>
                    <td style={S.td}>{u.todayMinutes} min</td>
                    <td style={S.td}>{u.monthMinutes} min</td>
                    <td style={S.td}>{u.memSizeKb} KB</td>

                    {/* Editable limits */}
                    {editing === u.id ? (
                      <>
                        <td style={S.td}><input style={S.numInput} type="number" value={limits[u.id]?.dailyMinutes || 30} onChange={e => setLimit(u.id, 'dailyMinutes', e.target.value)} /></td>
                        <td style={S.td}><input style={S.numInput} type="number" value={limits[u.id]?.monthlyMinutes || 300} onChange={e => setLimit(u.id, 'monthlyMinutes', e.target.value)} /></td>
                        <td style={S.td}><input style={S.numInput} type="number" value={limits[u.id]?.memoryKb || 512} onChange={e => setLimit(u.id, 'memoryKb', e.target.value)} /></td>
                      </>
                    ) : (
                      <>
                        <td style={S.td}>{u.limits?.dailyMinutes ?? 30} min</td>
                        <td style={S.td}>{u.limits?.monthlyMinutes ?? 300} min</td>
                        <td style={S.td}>{u.limits?.memoryKb ?? 512} KB</td>
                      </>
                    )}

                    <td style={S.td}>
                      <span style={{ ...S.badge, background: u.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: u.isActive ? '#10b981' : '#ef4444' }}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>

                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      {editing === u.id ? (
                        <>
                          <button style={S.saveBtn} onClick={() => saveLimits(u.id)} disabled={saving}>Save</button>
                          <button style={S.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button style={S.editBtn} onClick={() => setEditing(u.id)}>Edit</button>
                          <button
                            style={{ ...S.toggleBtn, background: u.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', color: u.isActive ? '#ef4444' : '#10b981' }}
                            onClick={() => toggleActive(u.id, !u.isActive)}
                          >
                            {u.isActive ? 'Disable' : 'Enable'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div style={S.infoBox}>
        <strong>How limits work:</strong> When a user reaches their daily or monthly minute limit, they see a friendly message and cannot start a new conversation until the next day/month. Memory limit controls max KB stored per user.
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...S.statCard, borderTop: `3px solid ${color}` }}>
      <div style={{ ...S.statValue, color }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#0f0f1a', padding: '28px 24px', maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 14 },
  logoutBtn: { background: 'rgba(255,255,255,0.06)', color: '#94a3b8', borderRadius: 10, padding: '8px 16px', fontSize: 14, border: '1px solid #2a2a4a', cursor: 'pointer' },
  toast: { background: '#10b981', color: '#fff', borderRadius: 10, padding: '10px 20px', marginBottom: 20, fontWeight: 600, textAlign: 'center' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 28 },
  statCard: { background: '#16213e', borderRadius: 14, padding: '20px 24px', border: '1px solid #2a2a4a' },
  statValue: { fontSize: 36, fontWeight: 700, marginBottom: 4 },
  statLabel: { color: '#64748b', fontSize: 13 },
  card: { background: '#16213e', borderRadius: 16, padding: '24px', border: '1px solid #2a2a4a', marginBottom: 20, overflowX: 'auto' },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 20 },
  loading: { color: '#64748b', fontSize: 15 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: { textAlign: 'left', color: '#64748b', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px', borderBottom: '1px solid #2a2a4a' },
  tr: { borderBottom: '1px solid #1e2a3a' },
  td: { padding: '12px 12px', color: '#e2e8f0', fontSize: 14, verticalAlign: 'middle' },
  badge: { borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 },
  numInput: { width: 70, background: '#0f0f1a', border: '1px solid #3a3a5a', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 13 },
  editBtn: { background: 'rgba(124,58,237,0.15)', color: '#a855f7', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 },
  saveBtn: { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 },
  cancelBtn: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer' },
  toggleBtn: { borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer', border: 'none' },
  infoBox: { background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, padding: '16px 20px', color: '#94a3b8', fontSize: 13, lineHeight: 1.6 },
};
