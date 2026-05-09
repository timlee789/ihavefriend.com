'use client';

/**
 * /admin/architect/samples/[id] — edit sample (admin only)
 *
 * Form fields: display_label / language / sort_order / is_active / structure
 * (JSON textarea — visual editor lives in Phase 2.5b).
 *
 * On save: PATCH /api/admin/architect/samples/[id]
 * On delete: confirm + DELETE
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AdminSampleEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [token, setToken]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [errorMsg, setErrorMsg]   = useState('');

  // Form state
  const [displayLabel, setDisplayLabel] = useState('');
  const [language, setLanguage]         = useState('ko');
  const [sortOrder, setSortOrder]       = useState(0);
  const [isActive, setIsActive]         = useState(true);
  const [structureText, setStructureText] = useState('');

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') { router.push('/login'); return; }
    setToken(t);
    loadSample(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, id]);

  async function loadSample(t) {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/admin/architect/samples/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        setErrorMsg(`로드 실패 (${res.status})`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      const sm = data.sample;
      setDisplayLabel(sm.display_label || '');
      setLanguage(sm.language || 'ko');
      setSortOrder(sm.sort_order || 0);
      setIsActive(sm.is_active !== false);
      setStructureText(JSON.stringify(sm.structure || { chapters: [] }, null, 2));
    } catch (e) {
      setErrorMsg(e?.message || '로드 실패');
    }
    setLoading(false);
  }

  async function handleSave() {
    setErrorMsg('');
    let parsed;
    try {
      parsed = JSON.parse(structureText);
    } catch (e) {
      setErrorMsg(`structure JSON 파싱 실패: ${e?.message}`);
      return;
    }
    if (!displayLabel.trim()) {
      setErrorMsg('표시 이름 (display_label) 이 필요합니다');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/architect/samples/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          display_label: displayLabel.trim(),
          language: language.trim(),
          sort_order: Number(sortOrder) || 0,
          is_active: !!isActive,
          structure: parsed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg('저장됨');
        setTimeout(() => setMsg(''), 2000);
      } else {
        setErrorMsg(data?.error || `저장 실패 (${res.status})`);
      }
    } catch (e) {
      setErrorMsg(e?.message || '저장 실패');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`정말 "${displayLabel}" 시나리오를 삭제할까요?\n\n사용 중인 자서전의 source_sample_id 는 NULL 로 자동 처리됩니다.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/architect/samples/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        router.push('/admin/architect/samples');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data?.error || `삭제 실패 (${res.status})`);
    } catch (e) {
      setErrorMsg(e?.message || '삭제 실패');
    }
    setSaving(false);
  }

  if (loading) {
    return <div style={S.page}><p style={S.loading}>불러오는 중…</p></div>;
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <button style={S.backBtn} onClick={() => router.push('/admin/architect/samples')}>‹ 시나리오 목록</button>
          <h1 style={S.title}>📝 시나리오 수정</h1>
          <p style={S.subtitle}><code>{id}</code></p>
        </div>
      </div>

      {msg && <div style={S.toast}>{msg}</div>}
      {errorMsg && <div style={S.errorBox}>⚠️ {errorMsg}</div>}

      <div style={S.card}>
        <Field label="표시 이름 *">
          <input style={S.input} type="text" value={displayLabel} onChange={e => setDisplayLabel(e.target.value)} placeholder="목차 샘플 1" />
        </Field>

        <div style={S.row3}>
          <Field label="언어">
            <select style={S.input} value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="ko">ko</option>
              <option value="en">en</option>
              <option value="es">es</option>
            </select>
          </Field>
          <Field label="순서 (sort_order)">
            <input style={S.input} type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
          </Field>
          <Field label="활성">
            <label style={S.checkboxLabel}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              <span style={{ marginLeft: 8 }}>{isActive ? 'Active' : 'Inactive'}</span>
            </label>
          </Field>
        </div>

        <Field label="Structure (JSON)">
          <textarea
            style={S.textarea}
            rows={28}
            spellCheck={false}
            value={structureText}
            onChange={e => setStructureText(e.target.value)}
          />
          <div style={S.hint}>
            chapters[].id, chapters[].title, chapters[].questions[].id, chapters[].questions[].prompt
            는 필수입니다. 잘못된 JSON 은 저장 시 거부됩니다.
          </div>
        </Field>

        <div style={S.actions}>
          <button style={S.cancelBtn} onClick={() => router.push('/admin/architect/samples')} disabled={saving}>
            취소
          </button>
          <button style={S.deleteBtn} onClick={handleDelete} disabled={saving}>
            🗑 삭제
          </button>
          <button style={S.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : '✅ 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#0f0f1a', padding: '28px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: { marginBottom: 28 },
  backBtn: { background: 'transparent', border: 'none', color: '#7c3aed', fontSize: 14, cursor: 'pointer', padding: '4px 0', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: 700, color: '#e2e8f0', margin: '0 0 4px' },
  subtitle: { color: '#64748b', fontSize: 13, margin: 0 },
  loading: { color: '#64748b', fontSize: 15, padding: '60px 0', textAlign: 'center' },
  toast: { background: '#10b981', color: '#fff', borderRadius: 10, padding: '10px 20px', marginBottom: 20, fontWeight: 600, textAlign: 'center' },
  errorBox: { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 14, lineHeight: 1.5 },
  card: { background: '#16213e', borderRadius: 16, padding: '24px', border: '1px solid #2a2a4a' },
  fieldLabel: { color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', background: '#0f0f1a', border: '1px solid #3a3a5a', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#0f0f1a', border: '1px solid #3a3a5a', borderRadius: 8, padding: '12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, monospace', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  checkboxLabel: { display: 'inline-flex', alignItems: 'center', color: '#e2e8f0', fontSize: 14, padding: '10px 0' },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #2a2a4a' },
  cancelBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3a5a', color: '#94a3b8', borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer' },
  deleteBtn: { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#ef4444', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#fb923c,#ea580c)', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
