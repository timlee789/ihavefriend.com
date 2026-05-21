'use client';

/**
 * components/visual-tree/VisualTree.jsx
 *
 * 전체 SVG 컨테이너. viewBox 680×1380 (잎 군집을 살짝 더 아래로 밀어서 ★ 잎과 분리).
 * - 인라인 <defs> 그라데이션 (lib/visualTree/colorTokens.js 의 ID 와 매칭)
 * - <StatsCard> 상단
 * - <TreeBackground> 줄기/가지/흙
 * - 챕터 수만큼 <Fruit>
 *
 * Tim 의 영구 통찰 #21: "열매가 주인공, 나무는 배경."
 *
 * Props:
 *   chapters            — V2 API 의 chapters 배열
 *   onFruitClick        — 일반 모드: (chapterId) => void
 *   onEditFruitClick    — 편집 모드: (chapter, event) => void  (event 로 mouse 좌표 캡처)
 *   onAddChapterClick   — 편집 모드 "+" 잎 클릭: () => void
 *   editMode            — boolean
 *   lang                — 'ko'|'en'|'es'
 */

import { assignPositions, getChapterStats, getActiveChapterCount } from '@/lib/visualTree/positionAlgorithm';
import { useIsMobile } from '@/lib/hooks/useMediaQuery';
import TreeBackground from './TreeBackground';
import Fruit from './Fruit';
import StatsCard from './StatsCard';
import s from './VisualTree.module.css';

export default function VisualTree({
  chapters = [],
  onFruitClick,
  onEditFruitClick,
  onAddChapterClick,
  editMode = false,
  lang = 'ko',
}) {
  const placed = assignPositions(chapters);
  const stats  = getChapterStats(chapters);
  const isMobile = useIsMobile();
  const currentChapterCount = getActiveChapterCount(chapters);

  return (
    <svg
      viewBox="0 0 680 1380"
      preserveAspectRatio="xMidYMid meet"
      className={s.tree}
      role="img"
      aria-label="내 인생의 나무 — 챕터 진행 현황"
    >
      {/* 모든 그라데이션 정의 — 자식 컴포넌트가 url(#id) 로 참조 */}
      <defs>
        {/* 줄기 */}
        <linearGradient id="trunkGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#3D2810" />
          <stop offset="25%"  stopColor="#6B4422" />
          <stop offset="55%"  stopColor="#8E5A2E" />
          <stop offset="80%"  stopColor="#5C3A1F" />
          <stop offset="100%" stopColor="#2D1A08" />
        </linearGradient>

        {/* 가지 */}
        <linearGradient id="branchGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#6B4422" />
          <stop offset="100%" stopColor="#4A2E18" />
        </linearGradient>

        {/* 흙 */}
        <radialGradient id="soilGradient" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0%"   stopColor="#6B4422" />
          <stop offset="100%" stopColor="#2D1A08" />
        </radialGradient>

        {/* 잎 4가지 상태 */}
        <radialGradient id="fruitNotStarted" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%"   stopColor="#A8DC88" />
          <stop offset="100%" stopColor="#8AC868" />
        </radialGradient>
        <radialGradient id="fruitInProgress" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%"   stopColor="#A589D8" />
          <stop offset="100%" stopColor="#8E6FC8" />
        </radialGradient>
        <radialGradient id="fruitCompleted" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%"   stopColor="#F2A058" />
          <stop offset="100%" stopColor="#F08838" />
        </radialGradient>
        <radialGradient id="fruitActiveRecent" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%"   stopColor="#FBD969" />
          <stop offset="60%"  stopColor="#F2B83A" />
          <stop offset="100%" stopColor="#D89A20" />
        </radialGradient>

        {/* ★ 후광 */}
        <radialGradient id="activeHalo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"   stopColor="#F2B83A" stopOpacity="0.55" />
          <stop offset="60%"  stopColor="#F2B83A" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#F2B83A" stopOpacity="0" />
        </radialGradient>
      </defs>

      <StatsCard stats={stats} lang={lang} isMobile={isMobile} />
      <TreeBackground
        editMode={editMode}
        onAddChapterClick={onAddChapterClick}
        lang={lang}
        isMobile={isMobile}
        currentChapterCount={currentChapterCount}
      />

      {placed.map((ch, i) => (
        <Fruit
          key={ch.id}
          chapter={ch}
          position={ch.position}
          onClick={onFruitClick}
          onEditClick={onEditFruitClick}
          editMode={editMode}
          lang={lang}
          index={i}
          isMobile={isMobile}
        />
      ))}
    </svg>
  );
}
