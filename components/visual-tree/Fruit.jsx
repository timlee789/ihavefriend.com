'use client';

/**
 * components/visual-tree/Fruit.jsx
 *
 * 단일 챕터 잎. 4가지 상태에 따라 색/라벨/부가정보/크기/애니메이션 모두 변경.
 *
 * Props:
 *   chapter   — { id, order, title, completed, total, ... }
 *   position  — { x, y }
 *   onClick   — (chapterId) => void
 *
 * 일반 잎: 반지름 82px
 * ★ 최근 작업: 반지름 115px + 후광 + 산들바람 + "이어서 쓰기" 버튼 (잎 안 하단)
 *
 * 라벨 알약은 잎 상단 위쪽에 오버레이.
 * 챕터 제목은 잎 중앙 (흰색 serif, 큰 글씨).
 * 하단 부가정보 = "N 질문" 또는 "N/M 이야기" 형태.
 */

import { FRUIT_FILL_URL } from '@/lib/visualTree/colorTokens';
import { titleOf } from '@/lib/i18nHelper';
import { TREE_MSGS } from './i18n';

function getLabel(m, status, completed, total) {
  if (status === 'in_progress' || status === 'active_recent') {
    return m.fruitStatus.inProgress(completed, total);
  }
  if (status === 'completed')   return m.fruitStatus.completed;
  if (status === 'active_recent') return m.fruitStatus.recent;
  return m.fruitStatus.notStarted;
}

function getFooter(m, status, completed, total) {
  if (status === 'not_started') return m.fruitMeta.questions(total);
  if (status === 'completed')   return m.fruitMeta.completedStories(completed);
  return m.fruitMeta.stories(completed, total);
}

/**
 * 챕터 제목 줄바꿈.
 * 영문 (공백 있음): 단어 단위로 line1 채우다 maxLen 넘으면 line2 로.
 * 한글 (공백 없음): 글자 가운데 분할.
 * line2 가 너무 길면 maxLen 까지 자르고 '…' 추가.
 */
function splitTitle(title, maxLen) {
  if (title.length <= maxLen) return [title];
  if (title.includes(' ')) {
    const words = title.split(' ');
    let line1 = '';
    let line2 = '';
    let usingLine2 = false;
    for (const word of words) {
      if (!usingLine2 && (line1 + ' ' + word).trim().length <= maxLen) {
        line1 = (line1 + ' ' + word).trim();
      } else {
        usingLine2 = true;
        line2 = (line2 + ' ' + word).trim();
      }
    }
    if (line2.length > maxLen + 2) {
      line2 = line2.substring(0, maxLen) + '…';
    }
    return line2 ? [line1, line2] : [line1];
  }
  const mid = Math.ceil(title.length / 2);
  return [title.substring(0, mid), title.substring(mid)];
}

/**
 * 글자 수에 따른 동적 폰트 크기 — 정밀 조정 버전 (잎 r=82/95 에 맞춤).
 * 모바일에서 SVG viewBox 축소 보정 위해 isMobile=true 시 각 단계 +4px.
 *   1~3:  32 / ★ 34  (한글 짧음)   [모바일: 36 / 38]
 *   4~5:  28 / ★ 30  (한글 보통)   [모바일: 32 / 34]
 *   6~8:  24 / ★ 26  (한글 김 / 영문 짧음)   [모바일: 28 / 30]
 *   9~12: 21 / ★ 22  (영문 보통 — 두 줄)   [모바일: 25 / 26]
 *   13+:  19 / ★ 20  (영문 김 — 두 줄 + …)   [모바일: 23 / 24]
 */
function getFontSize(len, isActive, isMobile = false) {
  const bump = isMobile ? 4 : 0;
  if (len <= 3)  return (isActive ? 34 : 32) + bump;
  if (len <= 5)  return (isActive ? 30 : 28) + bump;
  if (len <= 8)  return (isActive ? 26 : 24) + bump;
  if (len <= 12) return (isActive ? 22 : 21) + bump;
  return (isActive ? 20 : 19) + bump;
}

export default function Fruit({
  chapter,
  position,
  onClick,           // 일반 모드 — chapterId 전달 (기존 호환)
  onEditClick,       // 편집 모드 — (chapter, event) 전달
  editMode = false,
  lang = 'ko',
  index = 0,
  isMobile = false,
}) {
  const status = chapter.v3Status || 'not_started';
  const isActive = status === 'active_recent';
  const r = isActive ? 115 : 82;
  const { x, y } = position;
  const fill = FRUIT_FILL_URL[status];
  const completed = chapter.completed ?? 0;
  const total = chapter.total ?? 0;
  const m = TREE_MSGS[lang] || TREE_MSGS.ko;
  const label = getLabel(m, status, completed, total);
  const footer = getFooter(m, status, completed, total);
  const title = titleOf(chapter.title, lang) || `${chapter.order}`;

  // 제목 줄바꿈 + 폰트 — 컴포넌트 스코프에서 한 번만 계산
  const titleLines    = splitTitle(title, isActive ? 12 : 9);
  const titleFontSize = getFontSize(title.length, isActive, isMobile);
  const isTwoLine     = titleLines.length === 2;

  // 라벨 알약 크기 — 데스크탑: 영어 "Not Started" 도 잎 윤곽 안 (Step 1f).
  // 모바일: 글씨는 14px 유지 (가독성), 배경(rect)은 글씨 폭에 딱 맞게 축소 (Step 1g 보정).
  //   - 데스크탑: labelW max(70, len*8+16), labelH 20, fontSize 11
  //   - 모바일:   labelW max(70, len*7+14), labelH 22, fontSize 14 (글씨 ~85px + 좌우 약 6px)
  const labelCharW = isMobile ? 7 : 8;
  const labelPad   = isMobile ? 14 : 16;
  const labelMinW  = isMobile ? 70 : 70;
  const labelW = Math.max(labelMinW, label.length * labelCharW + labelPad);
  const labelH = isMobile ? 22 : 20;
  const labelFontSize = isMobile ? 14 : 11;
  // 풋터 ("N questions" 등) 폰트
  const footerFontSize = isActive
    ? (isMobile ? 20 : 17)
    : (isMobile ? 18 : 15);
  // ★ "Continue" 버튼 폰트
  const ctaFontSize = isMobile ? 16 : 14;

  const handleClick = (e) => {
    e.stopPropagation();
    if (editMode) {
      // 편집 모드: 라우팅 X, 메뉴 표시. event 전달해서 페이지가 mouse 좌표 캡처.
      onEditClick?.(chapter, e);
    } else {
      onClick?.(chapter.id);
    }
  };

  return (
    <g
      className={`fruit-group ${isActive ? 'active-fruit' : ''} fruit-fadein-${index + 1} ${editMode ? 'fruit-edit' : ''}`}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
      tabIndex={0}
      role="button"
      aria-label={editMode
        ? `${title} 챕터 편집 메뉴 열기`
        : `${title} 챕터 열기 (${label})`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (editMode) onEditClick?.(chapter, e);
          else onClick?.(chapter.id);
        }
      }}
    >
      {/* ★ 후광 — active_recent 만 */}
      {isActive && (
        <circle
          className="active-halo-pulse"
          cx={x}
          cy={y}
          r={r + 35}
          fill="url(#activeHalo)"
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}

      {/* 잎 본체 — drop-shadow 는 그룹 레벨 CSS 에서 (hover 시 강화) */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={fill}
        stroke={isActive ? '#D89A20' : 'rgba(0,0,0,0.06)'}
        strokeWidth={isActive ? 1.5 : 0.5}
      />

      {/* 잎 광택 highlight */}
      <ellipse
        cx={x - r * 0.3}
        cy={y - r * 0.4}
        rx={r * 0.32}
        ry={r * 0.22}
        fill="rgba(255,255,255,0.35)"
        style={{ pointerEvents: 'none' }}
      />

      {/* 라벨 알약 (잎 상단 가장자리 근처 — 챕터 제목과 충분히 분리) */}
      <g>
        <rect
          x={x - labelW / 2}
          y={y - r * 0.62}
          width={labelW}
          height={labelH}
          rx={labelH / 2}
          fill="rgba(255,255,255,0.95)"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
        <text
          x={x}
          y={y - r * 0.62 + labelH / 2 + 5}
          textAnchor="middle"
          fontSize={labelFontSize}
          fontWeight="700"
          fill={status === 'not_started' ? '#3A6E22' :
                status === 'completed'   ? '#9A4810' :
                status === 'active_recent' ? '#9A6810' : '#4A2E70'}
        >
          {label}
        </text>
      </g>

      {/* 챕터 제목 (잎 중앙, 검정, serif) — 한 줄 또는 두 줄.
          ★ 잎은 r=115 라 내부 공간 다르게 — 제목 위로, 풋터 가까이, 버튼 하단.
          일반 잎은 r=82 — 라벨/제목/풋터가 균등 분포. */}
      {(() => {
        const titleY1 = !isTwoLine
          ? (isActive ? y + 4 : y + 10)
          : (isActive ? y - 10 : y - 4);
        const titleY2 = isActive ? y + 10 : y + 20;
        return (
          <text
            x={x}
            textAnchor="middle"
            fontSize={titleFontSize}
            fontWeight="700"
            fontFamily='"Noto Serif KR", Georgia, serif'
            fill="#1A1208"
            style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(255,255,255,0.4)' }}
          >
            <tspan x={x} y={titleY1}>{titleLines[0]}</tspan>
            {isTwoLine && <tspan x={x} y={titleY2}>{titleLines[1]}</tspan>}
          </text>
        );
      })()}

      {/* 하단 부가정보 — ★ 는 제목과 가까이 (버튼 자리 비워줌), 일반은 더 아래. */}
      <text
        x={x}
        y={y + (isActive ? 30 : 46)}
        textAnchor="middle"
        fontSize={footerFontSize}
        fontWeight="600"
        fill="rgba(26,18,8,0.75)"
        style={{ pointerEvents: 'none' }}
      >
        {footer}
      </text>

      {/* ★ 최근 작업 — "▶ 이어서 쓰기" 버튼 (잎 안 하단, 절대 위치 y+50) */}
      {isActive && (
        <g style={{ pointerEvents: 'none' }}>
          <rect
            x={x - 65}
            y={y + 58}
            width="130"
            height="32"
            rx="16"
            fill="#5C4020"
            style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.18))' }}
          />
          <text
            x={x}
            y={y + 58 + 21}
            textAnchor="middle"
            fontSize={ctaFontSize}
            fontWeight="700"
            fill="#fff"
            letterSpacing="0.02em"
          >
            {m.continueWriting}
          </text>
        </g>
      )}
    </g>
  );
}
