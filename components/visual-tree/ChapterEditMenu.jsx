'use client';

/**
 * components/visual-tree/ChapterEditMenu.jsx
 *
 * 편집 모드에서 잎 클릭 시 등장하는 팝업 메뉴.
 *
 * Props:
 *   chapter     — V2 progress API 의 chapter 객체
 *   lang        — 'ko'|'en'|'es'
 *   clientX/clientY — 클릭 시점의 마우스 좌표 (viewport 기준)
 *   onClose     — 메뉴 닫기 (백드롭 클릭 또는 ✕)
 *   onRename    — 제목 바꾸기 모달 열기
 *   onDelete    — 삭제 확인 모달 열기
 *
 * 위치 계산: clientX/Y 기준 + 화면 가장자리 clamp.
 */

import { useEffect, useState } from 'react';
import { titleOf } from '@/lib/i18nHelper';
import { TREE_MSGS } from './i18n';
import s from './ChapterEditMenu.module.css';

const MENU_W = 220;
const MENU_H = 180;
const OFFSET = 16;

function clampPosition(clientX, clientY) {
  if (typeof window === 'undefined') return { left: 0, top: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 기본: 클릭 지점 우측 + 약간 아래
  let left = clientX + OFFSET;
  let top  = clientY - 30;
  // 우측이 잘리면 좌측으로
  if (left + MENU_W > vw - 8) left = clientX - MENU_W - OFFSET;
  if (left < 8) left = 8;
  // 하단이 잘리면 위로
  if (top + MENU_H > vh - 8) top = vh - MENU_H - 8;
  if (top < 8) top = 8;
  return { left, top };
}

export default function ChapterEditMenu({
  chapter,
  lang = 'ko',
  clientX = 0,
  clientY = 0,
  onClose,
  onRename,
  onDelete,
}) {
  const m = (TREE_MSGS[lang] || TREE_MSGS.ko).editMenu;
  const title = titleOf(chapter?.title, lang) || ((TREE_MSGS[lang] || TREE_MSGS.ko).renameModal.emptyTitle);
  const [pos, setPos] = useState(() => clampPosition(clientX, clientY));

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // viewport 크기 변하면 위치 재계산 (안전)
  useEffect(() => {
    const onResize = () => setPos(clampPosition(clientX, clientY));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clientX, clientY]);

  return (
    <>
      <div className={s.backdrop} onClick={onClose} />
      <div
        className={s.menu}
        style={{ left: pos.left, top: pos.top, width: MENU_W }}
        role="dialog"
        aria-label={m.ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={s.closeBtn}
          onClick={onClose}
          aria-label={m.closeLabel}
        >
          ✕
        </button>

        <div className={s.header}>
          <div className={s.title}>{title}</div>
          <div className={s.subtitle}>{m.subtitle}</div>
        </div>

        <div className={s.divider} />

        <button
          type="button"
          className={s.action}
          onClick={() => { onRename?.(); }}
        >
          {m.rename}
        </button>

        <button
          type="button"
          className={`${s.action} ${s.actionDanger}`}
          onClick={() => { onDelete?.(); }}
        >
          {m.delete}
        </button>
      </div>
    </>
  );
}
