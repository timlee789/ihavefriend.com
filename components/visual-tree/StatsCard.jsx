'use client';

/**
 * components/visual-tree/StatsCard.jsx
 *
 * Visual Tree 상단 통계 카드.
 * 흰 배경 알약 (560×70px) + 4개 영역: 완료 / 진행 중 / 시작 안 함 / 전체.
 *
 * 각 셀: 2층 레이아웃 — 윗줄 (동그라미 + 큰 숫자), 아랫줄 (라벨).
 * 라벨이 숫자에 붙어 안 보이던 문제 해결.
 *
 * Props:
 *   stats — { not_started, in_progress, completed, total }
 *
 * viewBox 안의 좌표 (680×1320). 카드 하단 (100) 과 ★ 잎 (y=200, r=110, 위쪽 끝 y=90) 사이 충분히 떨어짐.
 */

import { TREE_MSGS } from './i18n';

export default function StatsCard({ stats, lang = 'ko', isMobile = false }) {
  const m = TREE_MSGS[lang] || TREE_MSGS.ko;
  const cardX = 60;
  const cardY = 30;
  const cardW = 560;
  const cardH = 70;

  const cellW = cardW / 4;

  // 모바일에선 SVG 가 viewBox 축소되며 텍스트도 작아짐 — 폰트 키워서 시인성 회복.
  const numberFontSize = isMobile ? 28 : 24;
  const labelFontSize  = isMobile ? 16 : 11;
  const dotRadius      = isMobile ? 10 : 8;

  const items = [
    { label: m.stats.completed,  count: stats.completed,   color: '#F08838' },
    { label: m.stats.inProgress, count: stats.in_progress, color: '#8E6FC8' },
    { label: m.stats.notStarted, count: stats.not_started, color: '#8AC868' },
    { label: m.stats.total,      count: stats.total,       color: '#5C4020' },
  ];

  return (
    <g className="stats-card">
      <rect
        x={cardX}
        y={cardY}
        width={cardW}
        height={cardH}
        rx={cardH / 2}
        fill="rgba(255,255,255,0.96)"
        stroke="rgba(0,0,0,0.10)"
        strokeWidth="1"
        style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.12))' }}
      />
      {items.map((it, i) => {
        const cellCx = cardX + cellW * i + cellW / 2;
        const topRowY = cardY + 26;   // 윗줄 (동그라미 + 숫자) baseline
        const labelY  = cardY + 54;   // 아랫줄 (라벨) baseline
        return (
          <g key={it.label}>
            {/* 윗줄 — 동그라미 + 큰 숫자, 셀 중앙 정렬 */}
            <circle cx={cellCx - 22} cy={topRowY - 8} r={dotRadius} fill={it.color} />
            <text
              x={cellCx - 6}
              y={topRowY}
              textAnchor="start"
              fontSize={numberFontSize}
              fontWeight="700"
              fill="#2A1F14"
            >
              {it.count}
            </text>
            {/* 아랫줄 — 라벨, 셀 중앙 정렬 */}
            <text
              x={cellCx}
              y={labelY}
              textAnchor="middle"
              fontSize={labelFontSize}
              fontWeight="600"
              fill="rgba(42,31,20,0.65)"
              letterSpacing="0.02em"
            >
              {it.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
