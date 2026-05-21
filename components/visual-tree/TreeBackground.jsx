'use client';

/**
 * components/visual-tree/TreeBackground.jsx
 *
 * SVG 줄기 + 가지 + 흙 + 뿌리. 전체 opacity 0.7 로 배경 (영구 통찰 #21).
 *
 * V자 줄기 (위 좁고 아래 넓게). 줄기는 y=300 부터 시작 — ★ 잎 (y=300, r=115)
 * 가운데에서 시작해 잎 아래로 자연스럽게 흘러내림 (잎 fill 이 줄기 윗부분을 덮어 자연스러움).
 * Step 1g (2026-05-19): ★ 양옆에 첫 단 잎 배치 → ★ 좌우로 짧은 가로 가지 추가.
 *
 * 가지는 일반 잎 좌표 (y 470, 610, 750, 890, 1030) 기준 약 50px 위에서 뻗어남
 * (y 420, 560, 700, 840, 980).
 *
 * viewBox 680×1380 기준. transformOrigin 340 985 로 등장 시 treeGrow.
 */

import { TREE_MSGS } from './i18n';
import { MAX_CHAPTERS } from '@/lib/visualTree/positionAlgorithm';

export default function TreeBackground({
  editMode = false,
  onAddChapterClick,
  lang = 'ko',
  isMobile = false,
  currentChapterCount = 0,
}) {
  const m = TREE_MSGS[lang] || TREE_MSGS.ko;
  // "+" 잎의 라벨 크기 — 두 줄 라벨이라 글씨 크게.
  const addPlusFontSize = isMobile ? 38 : 34;
  const addLabelFontSize = isMobile ? 18 : 16;
  // 라벨을 공백 기준 두 줄로 분리 (모든 lang 이 2단어: "New Chapter" / "새 챕터" / "Nuevo capítulo").
  const addLabelParts = (m.addNewChapter || '').split(/\s+/).filter(Boolean);
  const addLabelLineGap = addLabelFontSize + 2;
  // 17개 도달 시 "+" 잎 hide (Step 1g — 챕터 수 제한)
  const canAddChapter = currentChapterCount < MAX_CHAPTERS;
  return (
    <>
    <g className="tree-body" style={{ opacity: 0.7, transformOrigin: '340px 985px' }}>
      {/* 흙 — 화면 하단 타원형 (viewBox 1380 에 맞춰 +60 내림) */}
      <ellipse cx="340" cy="1280" rx="320" ry="50" fill="url(#soilGradient)" />
      <ellipse cx="340" cy="1270" rx="280" ry="22" fill="#6B4422" opacity="0.5" />

      {/* 뿌리 — 흙에서 양옆으로 뻗어내림 (모든 y 좌표 +60) */}
      <path
        d="M 260 1235 Q 200 1250 140 1270 Q 190 1255 270 1248 Z"
        fill="#3D2810"
      />
      <path
        d="M 420 1235 Q 480 1250 540 1270 Q 490 1255 410 1248 Z"
        fill="#3D2810"
      />
      <path
        d="M 310 1230 Q 285 1255 250 1275 Q 300 1255 315 1242 Z"
        fill="#2D1A08"
      />
      <path
        d="M 370 1230 Q 395 1255 430 1275 Q 380 1255 365 1242 Z"
        fill="#2D1A08"
      />

      {/* 줄기 — V자, y=110 부터 시작 (통계 카드 하단 + 30px 여백).
          Step 1h: 250→300→110 (90px 위로). ★ 잎이 줄기 위에 매달려서 가로 가지로 연결. */}
      <path
        d="
          M 322 110
          Q 312 350 304 540
          Q 296 720 280 870
          Q 264 1050 240 1220
          L 440 1220
          Q 416 1050 400 870
          Q 384 720 376 540
          Q 368 350 358 110
          Z
        "
        fill="url(#trunkGradient)"
      />

      {/* 줄기 결무늬 — y1 110 부터, V자에 맞춰 아래로 벌어짐 */}
      <path
        d="M 322 110 Q 308 600 268 1220"
        stroke="#2D1A08"
        strokeWidth="1.2"
        opacity="0.42"
        fill="none"
      />
      <line
        x1="340" y1="110" x2="340" y2="1220"
        stroke="#2D1A08"
        strokeWidth="1"
        opacity="0.4"
      />
      <path
        d="M 358 110 Q 372 600 412 1220"
        stroke="#2D1A08"
        strokeWidth="1.2"
        opacity="0.42"
        fill="none"
      />

      {/* Step 1h — ★ 위쪽 가로 가지 한 줄.
          첫 단 잎 좌 (110, 210), ★ (340, 210), 첫 단 우 (570, 210) 모두 이 가지에 매달림.
          가지 y=200 (★ 상단 y=95 이지만 잎이 큼지막해서 가지가 잎 가운데 안쪽을 통과).
          잎 fill 이 가지 가운데를 덮어 "잎 뒤" 자연스러움. */}
      <path
        d="M 110 200 Q 340 175 570 200"
        stroke="url(#branchGradient)"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />

      {/* 가지 — 잎이 가지 위에 매달린 모양이 되도록 transform translate.
          Step 1h: SECOND_ROW_Y 가 70px 위로 (470→400) 옮긴 만큼 가지도 70 줄임 (90→20).
          잎 좌표 (400, 540, 680, 820, 960) 기준 가지가 잎 아래 약 40px 에 위치. */}
      <g transform="translate(0,20)">
        {/* 좌측 5개 */}
        <path
          d="M 320 420 Q 220 410 130 405 Q 175 412 220 416"
          stroke="url(#branchGradient)" strokeWidth="14" strokeLinecap="round" fill="none"
        />
        <path
          d="M 318 560 Q 215 565 130 570 Q 175 568 230 565"
          stroke="url(#branchGradient)" strokeWidth="16" strokeLinecap="round" fill="none"
        />
        <path
          d="M 316 700 Q 250 705 215 710 Q 250 707 290 703"
          stroke="url(#branchGradient)" strokeWidth="16" strokeLinecap="round" fill="none"
        />
        <path
          d="M 314 840 Q 220 845 125 850 Q 170 847 220 843"
          stroke="url(#branchGradient)" strokeWidth="17" strokeLinecap="round" fill="none"
        />
        <path
          d="M 312 980 Q 250 985 215 990 Q 250 987 290 983"
          stroke="url(#branchGradient)" strokeWidth="14" strokeLinecap="round" fill="none"
        />

        {/* 우측 5개 (거울 대칭) */}
        <path
          d="M 360 420 Q 460 410 555 405 Q 510 412 460 416"
          stroke="url(#branchGradient)" strokeWidth="14" strokeLinecap="round" fill="none"
        />
        <path
          d="M 362 560 Q 465 565 555 570 Q 510 568 450 565"
          stroke="url(#branchGradient)" strokeWidth="16" strokeLinecap="round" fill="none"
        />
        <path
          d="M 364 700 Q 415 705 465 710 Q 425 707 390 703"
          stroke="url(#branchGradient)" strokeWidth="16" strokeLinecap="round" fill="none"
        />
        <path
          d="M 366 840 Q 460 845 555 850 Q 510 847 460 843"
          stroke="url(#branchGradient)" strokeWidth="17" strokeLinecap="round" fill="none"
        />
        <path
          d="M 368 980 Q 415 985 465 990 Q 425 987 390 983"
          stroke="url(#branchGradient)" strokeWidth="14" strokeLinecap="round" fill="none"
        />
      </g>

      {/* editMode 시 흙 옆에 등장하는 점선 "+" 잎 — opacity 0.7 의 tree-body 안에 두면
          희미해 보이므로 closing </g> 뒤로 빼서 100% opacity 로 렌더. */}
    </g>

    {editMode && canAddChapter && (
      <g
        className="add-leaf"
        onClick={onAddChapterClick}
        style={{ cursor: 'pointer' }}
        role="button"
        aria-label="새 챕터 추가"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAddChapterClick?.();
          }
        }}
      >
        {/* Step 1i — "+" 잎을 줄기 중앙 (cx=340) 으로. 일반 잎은 좌우로 배치되니 중앙은 항상
            안 가려짐. 점선 가지 제거 — 줄기 자체가 가지 역할. drop-shadow 로 떠있는 느낌. */}
        <circle
          cx="340"
          cy="1140"
          r="64"
          fill="#FFFAF0"
          stroke="#9A6810"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))' }}
        />
        <text
          x="340"
          y="1125"
          textAnchor="middle"
          fontSize={addPlusFontSize}
          fontWeight="700"
          fill="#9A6810"
          style={{ pointerEvents: 'none' }}
        >
          +
        </text>
        {/* 라벨 두 줄 — "New Chapter" / "새 챕터" / "Nuevo capítulo" 모두 공백으로 split */}
        <text
          x="340"
          textAnchor="middle"
          fontSize={addLabelFontSize}
          fontWeight="600"
          fill="rgba(92,64,32,0.75)"
          style={{ pointerEvents: 'none' }}
        >
          <tspan x="340" y="1163">{addLabelParts[0] || ''}</tspan>
          {addLabelParts.length > 1 && (
            <tspan x="340" y={1163 + addLabelLineGap}>{addLabelParts.slice(1).join(' ')}</tspan>
          )}
        </text>
      </g>
    )}
  </>
  );
}
