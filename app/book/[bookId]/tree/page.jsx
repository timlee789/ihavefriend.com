'use client';

/**
 * /book/[bookId]/tree — Visual Tree (인생의 나무) V3.
 *
 * V2 의 /book/[bookId] 와 동일한 인증 + fetch 패턴, 다른 UI.
 * 잎 클릭 시:
 *   - 일반 모드: /book/[bookId]/v3/chapter/[chId] 로 이동
 *   - 편집 모드: ChapterEditMenu 팝업 (제목 바꾸기 / 삭제)
 *
 * 편집 모드 토글 버튼은 헤더 우측 (HTML, SVG 외부) — StatsCard SVG 와
 * HTML 버튼 섞을 수 없어 헤더에 배치. 시각적 위치는 spec 의도 (상단) 유지.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getUserLang, titleOf } from '@/lib/i18nHelper';
import { BOOK_MSGS } from '@/lib/bookI18n';
import VisualTree from '@/components/visual-tree/VisualTree';
import ChapterEditMenu from '@/components/visual-tree/ChapterEditMenu';
import RenameChapterModal from '@/components/visual-tree/RenameChapterModal';
import DeleteChapterModal from '@/components/visual-tree/DeleteChapterModal';
import AddChapterModal from '@/components/visual-tree/AddChapterModal';
import { TREE_MSGS } from '@/components/visual-tree/i18n';
import { useIsMobile } from '@/lib/hooks/useMediaQuery';
import { MAX_CHAPTERS, getActiveChapterCount } from '@/lib/visualTree/positionAlgorithm';

export default function BookTreePage() {
  const router = useRouter();
  const { bookId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState('ko');
  useEffect(() => { setLang(getUserLang()); }, []);

  // 편집 모드 state
  const [editMode, setEditMode] = useState(false);
  // 메뉴 열린 챕터 + 클릭 시점의 mouse 좌표 (viewport 기준)
  const [editingChapter, setEditingChapter] = useState(null); // { chapter, clientX, clientY }
  const [modalType, setModalType] = useState(null);            // 'rename' | 'delete' | 'add' | null

  const refetch = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) return;
    try {
      const res = await fetch(`/api/book/${bookId}/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error('[tree refetch]', e);
    }
  }, [bookId]);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      try { sessionStorage.setItem('postLoginRedirect', window.location.pathname); } catch {}
      router.replace('/login');
      return;
    }
    fetch(`/api/book/${bookId}/progress`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bookId, router]);

  const m = BOOK_MSGS[lang] || BOOK_MSGS.ko;
  const tm = TREE_MSGS[lang] || TREE_MSGS.ko;
  const isMobile = useIsMobile();

  if (loading) return <div style={loadingStyle}>{m.loading}</div>;
  if (!data?.book) return <div style={loadingStyle}>{m.bookNotFound}</div>;

  const { book, chapters } = data;
  const bookTitle = titleOf(book.title_i18n, lang) || book.title || m.bookDefaultTitle;
  // Milestone 5 Step 4 — 게이트 제거. 답변 1개 이상이면 책 만들기 진입점 표시.
  //   PDF 무료, 답변 0개 시만 hide (dead click 방지).
  const canMakeBook = (book?.completed_questions || 0) >= 1;

  // 일반 모드 — 챕터 진입
  const handleFruitClick = (chapterId) => {
    router.push(`/book/${bookId}/v3/chapter/${chapterId}`);
  };

  // 편집 모드 — 잎 클릭 시 메뉴 표시. event 로 mouse 좌표 캡처.
  const handleEditFruitClick = (chapter, event) => {
    setEditingChapter({
      chapter,
      clientX: event?.clientX ?? window.innerWidth / 2,
      clientY: event?.clientY ?? window.innerHeight / 2,
    });
  };

  const handleAddChapterClick = () => {
    // Step 1g — 17개 limit. 도달 시 모달 띄우지 않고 안내.
    const count = getActiveChapterCount(chapters);
    if (count >= MAX_CHAPTERS) {
      alert(tm.addModal.errorMaxReached);
      return;
    }
    setEditingChapter(null);
    setModalType('add');
  };

  const closeMenu = () => setEditingChapter(null);
  const closeModal = () => { setModalType(null); setEditingChapter(null); };

  return (
    <div style={pageStyle}>
      {/* 편집 토글의 펄스 dot keyframe — 인라인 style 만 쓰는 이 페이지에선
          <style> 태그로 inject 가 가장 단순 (unscoped 지만 이름 충돌 없음). */}
      <style>{`@keyframes indicatorPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* 헤더 — 데스크탑: 1줄 [Home | Title | View+Edit] / 모바일: 2줄 (buttons / title)
          Milestone 5 Step 1 — 우측 클러스터에 viewToggle (리스트 보기) 추가. */}
      <header style={isMobile ? mobileHeaderStyle : headerStyle}>
        {isMobile ? (
          <>
            <div style={mobileButtonRowStyle}>
              <button style={backBtnStyle} onClick={() => router.push('/')}>
                {m.backToHome}
              </button>
              <div style={rightClusterStyle}>
                {/* Milestone 5 Step 5 — makeBook 버튼 헤더에서 제거 → 나무 아래로 이동.
                    (모바일 헤더 짤림 해결 + "책 만들기"는 콘텐츠를 모아 만드는 동작이라 하단 자연) */}
                <button
                  type="button"
                  style={viewToggleBtnStyle}
                  onClick={() => router.push(`/book/${bookId}`)}
                  aria-label={m.viewAsList}
                >
                  {m.viewAsList}
                </button>
                <button
                  type="button"
                  style={{
                    ...editToggleStyle,
                    ...(editMode ? editToggleActiveStyle : null),
                  }}
                  onClick={() => {
                    setEditMode(prev => {
                      const next = !prev;
                      if (!next) { setEditingChapter(null); }
                      return next;
                    });
                  }}
                  aria-pressed={editMode}
                >
                  {editMode && <span style={indicatorDotStyle} />}
                  <span>{editMode ? tm.editModeOn : tm.editModeOff}</span>
                </button>
              </div>
            </div>
            <h1 style={mobileTitleStyle}>🌳 {bookTitle}</h1>
          </>
        ) : (
          <>
            <button style={backBtnStyle} onClick={() => router.push('/')}>
              {m.backToHome}
            </button>
            <h1 style={titleStyle}>🌳 {bookTitle}</h1>
            <div style={rightClusterStyle}>
              {/* Milestone 5 Step 5 — makeBook 버튼 헤더에서 제거 → 나무 아래로 이동. */}
              <button
                type="button"
                style={viewToggleBtnStyle}
                onClick={() => router.push(`/book/${bookId}`)}
                aria-label={m.viewAsList}
              >
                {m.viewAsList}
              </button>
              <button
                type="button"
                style={{
                  ...editToggleStyle,
                  ...(editMode ? editToggleActiveStyle : null),
                }}
                onClick={() => {
                  setEditMode(prev => {
                    const next = !prev;
                    if (!next) { setEditingChapter(null); }
                    return next;
                  });
                }}
                aria-pressed={editMode}
              >
                {editMode && <span style={indicatorDotStyle} />}
                <span>{editMode ? tm.editModeOn : tm.editModeOff}</span>
              </button>
            </div>
          </>
        )}
      </header>

      <div style={treeContainerStyle}>
        <VisualTree
          chapters={chapters}
          onFruitClick={handleFruitClick}
          onEditFruitClick={handleEditFruitClick}
          onAddChapterClick={handleAddChapterClick}
          editMode={editMode}
          lang={lang}
        />
      </div>

      {/* Milestone 5 Step 5 — "책 만들기" 버튼을 나무 아래로. 답변 1개 이상일 때만.
          이야기를 다 보고 난 뒤 "이제 책으로" 라는 흐름이 자연스러움. */}
      {canMakeBook && (
        <div style={makeBookFooterStyle}>
          <button
            type="button"
            style={makeBookFooterBtnStyle}
            onClick={() => router.push(`/book/${bookId}`)}
            aria-label={m.makeBook}
          >
            {m.makeBook}
          </button>
        </div>
      )}

      {/* 편집 메뉴 — 잎 옆 팝업 */}
      {editingChapter && !modalType && (
        <ChapterEditMenu
          chapter={editingChapter.chapter}
          lang={lang}
          clientX={editingChapter.clientX}
          clientY={editingChapter.clientY}
          onClose={closeMenu}
          onRename={() => setModalType('rename')}
          onDelete={() => setModalType('delete')}
        />
      )}

      {/* 3개 모달 */}
      {modalType === 'rename' && editingChapter && (
        <RenameChapterModal
          bookId={bookId}
          chapter={editingChapter.chapter}
          lang={lang}
          onClose={closeModal}
          onSuccess={refetch}
        />
      )}
      {modalType === 'delete' && editingChapter && (
        <DeleteChapterModal
          bookId={bookId}
          chapter={editingChapter.chapter}
          lang={lang}
          onClose={closeModal}
          onSuccess={refetch}
        />
      )}
      {modalType === 'add' && (
        <AddChapterModal
          bookId={bookId}
          lang={lang}
          onClose={closeModal}
          onSuccess={refetch}
        />
      )}
    </div>
  );
}

// ── 인라인 스타일 ──
const pageStyle = {
  minHeight: '100dvh',
  background: 'linear-gradient(180deg, #FFFAF0 0%, #F2E8D5 60%, #E8D5BC 100%)',
  padding: '12px 16px 40px',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  maxWidth: 720,
  margin: '0 auto 8px',
};

// 모바일 (≤768px) — 헤더 2줄: [Home][Edit] row / Title row
const mobileHeaderStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  maxWidth: 720,
  margin: '0 auto 12px',
};

const mobileButtonRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const mobileTitleStyle = {
  fontSize: 24,
  fontWeight: 700,
  color: '#2A1F14',
  margin: 0,
  fontFamily: '"Noto Serif KR", Georgia, serif',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const titleStyle = {
  fontSize: 26,
  fontWeight: 700,
  color: '#2A1F14',
  margin: 0,
  fontFamily: '"Noto Serif KR", Georgia, serif',
  textAlign: 'center',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const backBtnStyle = {
  background: 'rgba(255, 255, 255, 0.9)',
  // border shorthand 대신 longhand — React rerender 시 borderColor only override 와의
  // 충돌 방지 + 다른 active state 가 추가될 수 있는 미래 안전.
  borderWidth: 1.5,
  borderStyle: 'solid',
  borderColor: 'rgba(154, 104, 16, 0.4)',
  color: '#5C4020',
  padding: '14px 22px',
  borderRadius: 16,
  fontSize: 16,
  fontWeight: 700,
  minHeight: 52,
  minWidth: 140,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

// Milestone 5 Step 5 — "책 만들기" 버튼을 나무 아래 중앙으로. 큰 primary CTA.
const makeBookFooterStyle = {
  display: 'flex',
  justifyContent: 'center',
  maxWidth: 720,
  margin: '24px auto 8px',
  padding: '0 16px',
};

const makeBookFooterBtnStyle = {
  background: 'linear-gradient(135deg, #FFE89A 0%, #F2B83A 100%)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(216, 154, 32, 0.55)',
  color: '#5C4020',
  padding: '16px 36px',
  borderRadius: 18,
  fontSize: 17,
  fontWeight: 700,
  minHeight: 56,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  whiteSpace: 'nowrap',
  boxShadow: '0 4px 14px rgba(216, 154, 32, 0.3)',
};

// Milestone 5 Step 1 — Tree/List View 전환 토글. 작은 chip 스타일 (editToggle 보다 컴팩트).
const viewToggleBtnStyle = {
  background: 'rgba(255, 255, 255, 0.75)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(154, 104, 16, 0.3)',
  color: '#5C4020',
  padding: '8px 14px',
  borderRadius: 14,
  fontSize: 13,
  fontWeight: 600,
  minHeight: 40,
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
  transition: 'background 0.15s ease, border-color 0.15s ease',
  whiteSpace: 'nowrap',
};

// Tree 헤더 우측 클러스터 — viewToggle + editToggle 묶음. Milestone 5 Step 1.
const rightClusterStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const editToggleStyle = {
  background: '#fff',
  // border shorthand 대신 3개 longhand — editToggleActiveStyle 가 borderColor 만
  // override 할 때 React 의 "Removing a style property during rerender" 경고 회피.
  borderWidth: 1.5,
  borderStyle: 'solid',
  borderColor: 'rgba(154, 104, 16, 0.4)',
  color: '#5C4020',
  // Milestone 5 Step 5 — 폰버전 짤림 해결을 위해 축소 (padding/minWidth/fontSize 줄임).
  padding: '9px 12px',
  borderRadius: 14,
  fontSize: 13,
  fontWeight: 700,
  minHeight: 40,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
};

const editToggleActiveStyle = {
  background: '#5C4020',
  borderColor: '#3D2310',
  color: '#FFE89A',
};

const indicatorDotStyle = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#FBD969',
  display: 'inline-block',
  animation: 'indicatorPulse 1.8s ease-in-out infinite',
};

const treeContainerStyle = {
  maxWidth: 720,
  margin: '0 auto',
};

const loadingStyle = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  color: '#5C4020',
  background: 'linear-gradient(180deg, #FFFAF0 0%, #F2E8D5 100%)',
};
