'use client';

/**
 * /admin/architect/samples/new — create new sample (admin only)
 *
 * Form fields: id / display_label / language / sort_order / is_active
 * + structure (JSON textarea, pre-filled with empty template).
 *
 * "기존 시나리오 복제" dropdown lets admin clone any existing sample's
 * structure (id stays blank — admin must provide unique id).
 *
 * On create: POST /api/admin/architect/samples (idempotent INSERT ON
 * CONFLICT, but we treat as create — server returns created=true|false).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const EMPTY_TEMPLATE = {
  chapters: [
    {
      id: 'chapter-1',
      title: '챕터 제목',
      questions: [
        { id: 'q1', prompt: '첫 번째 질문을 작성해주세요.' },
      ],
    },
  ],
};

export default function AdminSampleNewPage() {
  const router = useRouter();

  const [token, setToken]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 기존 시나리오 (복제 dropdown 용)
  const [existingSamples, setExistingSamples] = useState([]);
  const [cloneFrom, setCloneFrom]             = useState(''); // '' = empty template

  // Form state
  const [id, setId]                       = useState('');
  const [displayLabel, setDisplayLabel]   = useState('');
  const [language, setLanguage]           = useState('ko');
  const [sortOrder, setSortOrder]         = useState(0);
  const [isActive, setIsActive]           = useState(true);
  const [structureText, setStructureText] = useState(
    JSON.stringify(EMPTY_TEMPLATE, null, 2)
  );

  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    if (!t || !u || u.role !== 'admin') { router.push('/login'); return; }
    setToken(t);
    loadExisting(t);
  }, [router]);

  async function loadExisting(t) {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/architect/samples', {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const samples = data.samples || [];
        setExistingSamples(samples);
        // sort_order 기본값 = 다음 번호 (현재 max + 1)
        const maxOrder = samples.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
        setSortOrder(maxOrder + 1);
      }
    } catch {}
    setLoading(false);
  }

  async function handleClone(sampleId) {
    setCloneFrom(sampleId);
    if (!sampleId) {
      // 빈 template 으로 reset
      setStructureText(JSON.stringify(EMPTY_TEMPLATE, null, 2));
      return;
    }
    // 해당 sample 의 structure 가져와서 textarea 에 채움 (id 는 비워둠)
    try {
      const res = await fetch(`/api/admin/architect/samples/${encodeURIComponent(sampleId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const sm = data.sample;
        setStructureText(JSON.stringify(sm.structure || EMPTY_TEMPLATE, null, 2));
        // language / display_label 도 hint 로 같이 채워줌 (admin 이 바꿀 수 있음)
        if (!displayLabel) setDisplayLabel(`${sm.display_label} 복사본`);
        setLanguage(sm.language || 'ko');
      }
    } catch (e) {
      setErrorMsg(e?.message || '복제 실패');
    }
  }

  async function handleCreate() {
    setErrorMsg('');
    if (!id.trim()) {
      setErrorMsg('id 가 필요합니다 (예: sample-006)');
      return;
    }
    if (!displayLabel.trim()) {
      setErrorMsg('표시 이름 (display_label) 이 필요합니다');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(structureText);
    } catch (e) {
      setErrorMsg(`structure JSON 파싱 실패: ${e?.message}`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/architect/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: id.trim(),
          display_label: displayLabel.trim(),
          language: language.trim(),
          sort_order: Number(sortOrder) || 0,
          is_active: !!isActive,
          structure: parsed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push('/admin/architect/samples');
        return;
      }
      setErrorMsg(data?.error || `생성 실패 (${res.status})`);
    } catch (e) {
      setErrorMsg(e?.message || '생성 실패');
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
          <h1 style={S.title}>➕ 새 시나리오</h1>
          <p style={S.subtitle}>Architect Bot V2 — Blueprint Sample 추가</p>
        </div>
      </div>

      {errorMsg && <div style={S.errorBox}>⚠️ {errorMsg}</div>}

      <div style={S.card}>
        <Field label="기존 시나리오 복제 (선택)">
          <select style={S.input} value={cloneFrom} onChange={e => handleClone(e.target.value)}>
            <option value="">— 빈 template 으로 시작 —</option>
            {existingSamples.map(sm => (
              <option key={sm.id} value={sm.id}>
                {sm.id} — {sm.display_label} ({sm.chapter_count} 챕터)
              </option>
            ))}
          </select>
          <div style={S.hint}>
            기존 시나리오를 선택하면 structure 가 복사됩니다. id 는 비워두세요 — 새 id 를 직접 정하셔야 합니다.
          </div>
        </Field>

        <hr style={S.divider} />

        <Field label="ID *">
          <input
            style={S.input}
            type="text"
            value={id}
            onChange={e => setId(e.target.value)}
            placeholder="sample-006"
          />
          <div style={S.hint}>
            unique 식별자. 한번 정하면 변경 불가. 패턴: sample-001, sample-002, …
          </div>
        </Field>

        <Field label="표시 이름 *">
          <input
            style={S.input}
            type="text"
            value={displayLabel}
            onChange={e => setDisplayLabel(e.target.value)}
            placeholder="목차 샘플 6"
          />
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
            는 필수입니다. 잘못된 JSON 은 생성 시 거부됩니다.
          </div>
        </Field>

        <div style={S.actions}>
          <button style={S.cancelBtn} onClick={() => router.push('/admin/architect/samples')} disabled={saving}>
            취소
          </button>
          <button style={S.saveBtn} onClick={handleCreate} disabled={saving}>
            {saving ? '생성 중…' : '✅ 생성'}
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
  errorBox: { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5', borderRadius: 10, padding: '12px 18px', marginBottom: 20, fontSize: 14, lineHeight: 1.5 },
  card: { background: '#16213e', borderRadius: 16, padding: '24px', border: '1px solid #2a2a4a' },
  fieldLabel: { color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 6 },
  input: { width: '100%', background: '#0f0f1a', border: '1px solid #3a3a5a', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#0f0f1a', border: '1px solid #3a3a5a', borderRadius: 8, padding: '12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, monospace', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 },
  checkboxLabel: { display: 'inline-flex', alignItems: 'center', color: '#e2e8f0', fontSize: 14, padding: '10px 0' },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 },
  divider: { border: 'none', borderTop: '1px solid #2a2a4a', margin: '20px 0' },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid #2a2a4a' },
  cancelBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid #3a3a5a', color: '#94a3b8', borderRadius: 10, padding: '10px 18px', fontSize: 14, cursor: 'pointer' },
  saveBtn: { background: 'linear-gradient(135deg,#fb923c,#ea580c)', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
