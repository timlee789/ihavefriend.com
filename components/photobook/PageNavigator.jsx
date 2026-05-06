'use client';

/**
 * PageNavigator — fixed bottom bar for the editor.
 *
 * Layout (mobile):
 *   [ ‹ prev ]  [ "3 / 7" ]  [ next › ]   [ + 페이지 추가 ]   [ ⋮ ]
 *
 * The ⋮ menu opens a small sheet with: 페이지 삭제 / 순서 변경 / PDF 미리보기.
 * Reorder is implemented via the <ReorderSheet>: a thumbnail list with
 * up/down buttons (drag-and-drop on touch is hostile to seniors and
 * needs a library; up/down is two finger taps and works everywhere).
 *
 * Props:
 *   pages         : [{ id, page_number, page_title, photo? }, ...]
 *   currentIndex  : 0-based index in `pages`
 *   onNavigate(i) : change current page
 *   onAdd()       : add new page (parent does the POST)
 *   onDelete()    : delete current page (parent does the DELETE)
 *   onReorder(orderedIds[]) : commit reorder (parent does POST /reorder)
 *   onPdfPreview()          : optional; if undefined we show "coming soon"
 *   busy          : show "adding…" hint
 *   lang          : 'KO' | 'EN' | 'ES'
 */

import { useState } from 'react';
import { pbMsgs } from './photobookI18n';

export default function PageNavigator({
  pages = [],
  currentIndex = 0,
  onNavigate,
  onAdd,
  onDelete,
  onReorder,
  onPdfPreview,
  busy,
  lang = 'KO',
}) {
  const m = pbMsgs(lang);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);

  const total = pages.length;
  const cur = total > 0 ? currentIndex + 1 : 0;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < total - 1;

  function nav(delta) {
    const next = currentIndex + delta;
    if (next < 0 || next >= total) return;
    onNavigate?.(next);
  }

  function handleReorderCommit(orderedIds) {
    setReorderOpen(false);
    onReorder?.(orderedIds);
  }

  function handlePdfPreview() {
    setMenuOpen(false);
    if (onPdfPreview) onPdfPreview();
    else window.alert(m.pdfPreviewSoon);
  }

  function handleDelete() {
    setMenuOpen(false);
    onDelete?.();
  }

  function handleReorder() {
    setMenuOpen(false);
    setReorderOpen(true);
  }

  return (
    <>
      <nav className="navBar">
        <button
          type="button"
          className="navBtn"
          onClick={() => nav(-1)}
          disabled={!canPrev}
          aria-label={m.prevPage}
        >‹</button>

        <div className="counter" aria-live="polite">
          {total > 0 ? m.pageCounter(cur, total) : '—'}
        </div>

        <button
          type="button"
          className="navBtn"
          onClick={() => nav(+1)}
          disabled={!canNext}
          aria-label={m.nextPage}
        >›</button>

        {/* 🔥 Tim 2026-05-06 — "+ 페이지 추가" 버튼 제거.
            header 우측 상단으로 이동했기 때문에 여기엔 년은 입니다. */}

        <button
          type="button"
          className="moreBtn"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={m.moreActions}
          disabled={total === 0 && !onPdfPreview}
        >⋮</button>
      </nav>

      {menuOpen && (
        <div className="menuOverlay" onClick={() => setMenuOpen(false)}>
          <div className="menuSheet" onClick={(e) => e.stopPropagation()}>
            <div className="menuHandle" />
            <button
              type="button"
              className="menuItem"
              onClick={handleReorder}
              disabled={total < 2}
            >
              ↕  {m.reorderPagesTitle}
            </button>
            <button
              type="button"
              className="menuItem"
              onClick={handlePdfPreview}
            >
              📄  {m.pdfPreviewBtn}
            </button>
            <button
              type="button"
              className="menuItem danger"
              onClick={handleDelete}
              disabled={total === 0}
            >
              🗑️  {m.pageDeletePrompt}
            </button>
            <button
              type="button"
              className="menuCancel"
              onClick={() => setMenuOpen(false)}
            >
              {m.cancel}
            </button>
          </div>
        </div>
      )}

      {reorderOpen && (
        <ReorderSheet
          pages={pages}
          lang={lang}
          onCancel={() => setReorderOpen(false)}
          onCommit={handleReorderCommit}
        />
      )}

      <style jsx>{`
        /* 🔥 Tim 2026-05-06 — navigator 를 하단 fixed 에서 상단 sticky
           로 이동. 사진 바로 위에 언제나 보이도록 해서 시니어가
           이전/다음 페이지로 이동을 알고 싶을 때 눈을 아래로 내릴
           필요 없도록. "+ 페이지 추가" 는 header 로 옮겼고 이곳은
           이전/카운터/다음 + ⋮ 만 남아 layout 이 원술해졌음. */
        .navBar {
          position: sticky;
          top: 64px; /* header 높이 아래 — 스크롤 시 함께 이동하다
                       상단 고정 */
          z-index: 15;
          background: rgba(26, 20, 16, 0.96);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: 560px;
          margin: 0 auto;
        }
        .navBtn {
          width: 44px; height: 44px;
          border-radius: 12px;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.92);
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
        }
        .navBtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
        .navBtn:disabled { opacity: 0.32; cursor: not-allowed; }
        .counter {
          flex: 1;
          text-align: center;
          color: rgba(255, 255, 255, 0.85);
          font-size: 14px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }
        /* 🔥 .addBtn 제거 — header 우측 상단 .headerAddBtn 으로 이동 */
        .moreBtn {
          width: 44px; height: 44px;
          border-radius: 12px;
          border: none;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.92);
          font-size: 22px;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
        }
        .moreBtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
        .moreBtn:disabled { opacity: 0.32; cursor: not-allowed; }

        .menuOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          z-index: 60;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: fadeIn 0.18s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .menuSheet {
          width: 100%;
          max-width: 560px;
          background: #1a1410;
          border-radius: 20px 20px 0 0;
          padding: 8px 14px calc(14px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
          animation: slideUp 0.22s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .menuHandle {
          width: 36px; height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          margin: 0 auto 12px;
        }
        .menuItem {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 16px 14px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.92);
          font-size: 16px;
          font-weight: 600;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          border-radius: 10px;
        }
        .menuItem:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
        .menuItem:disabled { opacity: 0.4; cursor: not-allowed; }
        .menuItem.danger { color: #fca5a5; }
        .menuCancel {
          margin-top: 6px;
          width: 100%;
          padding: 14px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// ReorderSheet — drag-free reorder UI with up/down buttons
// ────────────────────────────────────────────────────────────────────
// Why no drag-and-drop:
//   1. No library installed (react-dnd / dnd-kit pulls ~30KB gzipped)
//   2. Mobile drag with the system scroll fighting the drag handle is
//      a known UX trap, especially for seniors
//   3. Up/down arrows are O(n) taps but the typical book is ≤10-15
//      pages, so it's still seconds, and the affordance is obvious
//   4. We can add drag later as a progressive enhancement
//
// The list works on a local copy until "완료" — only then do we
// commit via onCommit(orderedIds) so the parent can fire the reorder
// API call.

function ReorderSheet({ pages, lang = 'KO', onCancel, onCommit }) {
  const m = pbMsgs(lang);
  const [order, setOrder] = useState(() => pages.map(p => p));

  function move(idx, delta) {
    const next = idx + delta;
    if (next < 0 || next >= order.length) return;
    setOrder(arr => {
      const copy = [...arr];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function commit() {
    const ids = order.map(p => p.id);
    const original = pages.map(p => p.id);
    const changed = ids.some((id, i) => id !== original[i]);
    if (!changed) {
      onCancel?.();
      return;
    }
    onCommit?.(ids);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="sheet">
        <div className="handle" />
        <div className="title">{m.reorderPagesTitle}</div>
        <div className="hint">{m.reorderHint}</div>

        {order.length === 0 ? (
          <div className="empty">{m.reorderEmpty}</div>
        ) : (
          <ul className="list">
            {order.map((p, i) => (
              <li key={p.id} className="item">
                <div className="thumb">
                  {p.photo?.r2_url ? (
                    <img src={p.photo.r2_url} alt="" />
                  ) : (
                    <span className="thumbBlank">📄</span>
                  )}
                </div>
                <div className="meta">
                  <div className="pageNum">{i + 1}</div>
                  {p.page_title && <div className="pageTitle">{p.page_title}</div>}
                </div>
                <div className="moveBtns">
                  <button
                    type="button"
                    className="moveBtn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={m.moveUp}
                  >↑</button>
                  <button
                    type="button"
                    className="moveBtn"
                    onClick={() => move(i, +1)}
                    disabled={i === order.length - 1}
                    aria-label={m.moveDown}
                  >↓</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="row">
          <button type="button" className="btnSecondary" onClick={onCancel}>
            {m.cancel}
          </button>
          <button type="button" className="btnPrimary" onClick={commit}>
            {m.reorderDoneBtn}
          </button>
        </div>
      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 70;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: fadeIn 0.18s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .sheet {
          width: 100%;
          max-width: 560px;
          max-height: 86dvh;
          background: #1a1410;
          color: rgba(255, 255, 255, 0.92);
          border-radius: 20px 20px 0 0;
          padding: 12px 16px calc(20px + env(safe-area-inset-bottom, 0px));
          display: flex;
          flex-direction: column;
          animation: slideUp 0.22s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .handle {
          width: 36px; height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          margin: 0 auto 12px;
        }
        .title {
          font-size: 17px;
          font-weight: 700;
          color: #fdf8f4;
          text-align: center;
          margin-bottom: 4px;
        }
        .hint {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          text-align: center;
          margin-bottom: 14px;
        }
        .list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .thumb {
          width: 56px;
          height: 56px;
          border-radius: 8px;
          background: #000;
          overflow: hidden;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .thumb img { width: 100%; height: 100%; object-fit: cover; }
        .thumbBlank {
          font-size: 24px;
          color: rgba(255, 255, 255, 0.45);
        }
        .meta {
          flex: 1;
          min-width: 0;
        }
        .pageNum {
          font-size: 13px;
          color: #fdba74;
          font-weight: 700;
        }
        .pageTitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.88);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .moveBtns {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-shrink: 0;
        }
        .moveBtn {
          width: 44px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.85);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          font-family: inherit;
        }
        .moveBtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
        .moveBtn:disabled { opacity: 0.3; cursor: not-allowed; }
        .empty {
          padding: 32px 0;
          text-align: center;
          color: rgba(255, 255, 255, 0.45);
          font-size: 14px;
        }
        .row {
          margin-top: 12px;
          display: flex;
          gap: 10px;
        }
        .row button {
          flex: 1;
          min-height: 50px;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
        }
        .btnPrimary {
          background: linear-gradient(135deg, #fb923c, #ea580c);
          color: #fff;
        }
        .btnSecondary {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
        }
      `}</style>
    </div>
  );
}
