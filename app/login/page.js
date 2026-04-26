'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, password: form.password, name: form.name };

      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); return; }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <div style={styles.logoIcon}>📚</div>
          <h1 style={styles.logoText}>SayAndKeep</h1>
          <p style={styles.logoSub}>A space to listen, organize, and keep every story</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button style={{...styles.tab, ...(mode==='login' ? styles.tabActive : {})}} onClick={()=>setMode('login')}>
            Sign In
          </button>
          <button style={{...styles.tab, ...(mode==='register' ? styles.tabActive : {})}} onClick={()=>setMode('register')}>
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={styles.form}>
          {mode === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Your Name</label>
              <input
                style={styles.input}
                type="text"
                placeholder="e.g. Margaret"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Email Address</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button style={{...styles.btn, ...(loading ? styles.btnDisabled : {})}} type="submit" disabled={loading}>
            {loading ? '⏳ Please wait...' : mode === 'login' ? '→  Sign In' : '✨  Create My Account'}
          </button>
        </form>

        <p style={styles.footer}>
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <span style={styles.link} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create one free' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
    padding: '20px',
  },
  card: {
    background: '#16213e',
    borderRadius: 24,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
    border: '1px solid #2a2a4a',
  },
  logo: { textAlign: 'center', marginBottom: 32 },
  logoIcon: { fontSize: 48, marginBottom: 8 },
  logoText: { fontSize: 28, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 },
  logoSub: { fontSize: 14, color: '#94a3b8', lineHeight: 1.5 },
  tabs: {
    display: 'flex',
    background: '#0f0f1a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 10,
    background: 'transparent',
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#7c3aed',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(124,58,237,0.4)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 14, color: '#94a3b8', fontWeight: 500 },
  input: {
    background: '#0f0f1a',
    border: '1px solid #2a2a4a',
    borderRadius: 10,
    padding: '14px 16px',
    color: '#e2e8f0',
    fontSize: 16,
    transition: 'border-color 0.2s',
  },
  error: {
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: '12px 16px',
    color: '#fca5a5',
    fontSize: 14,
  },
  btn: {
    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    color: '#fff',
    borderRadius: 12,
    padding: '15px',
    fontSize: 17,
    fontWeight: 600,
    marginTop: 4,
    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
    transition: 'opacity 0.2s, transform 0.1s',
  },
  btnDisabled: { opacity: 0.6 },
  footer: { textAlign: 'center', marginTop: 24, color: '#94a3b8', fontSize: 14 },
  link: { color: '#a855f7', cursor: 'pointer', fontWeight: 500 },
};
