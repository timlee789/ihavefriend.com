/**
 * lib/visualTree/colorTokens.js
 *
 * 모든 색상 토큰을 한 곳에 모은 single source of truth.
 * STRATEGY-visual-tree-and-chapter-entry-2026-05-17.md 의 색상 spec 을 그대로 옮김.
 *
 * 사용 패턴:
 *   import { STATUS_COLORS, TREE_COLORS, getStatusColor } from '@/lib/visualTree/colorTokens';
 *   const { fill, label } = getStatusColor('completed');
 */

// 4가지 챕터 상태 색
export const STATUS_COLORS = {
  not_started: {
    fillStart: '#A8DC88',
    fillEnd:   '#8AC868',
    stroke:    '#5C8A3D',
    label:     '시작 안 함',
    labelBg:   'rgba(255, 255, 255, 0.95)',
    labelFg:   '#3A6E22',
    tone:      'cool', // 차가운 그룹 (미완)
  },
  in_progress: {
    fillStart: '#A589D8',
    fillEnd:   '#8E6FC8',
    stroke:    '#5C4090',
    label:     '진행 중',
    labelBg:   'rgba(255, 255, 255, 0.95)',
    labelFg:   '#4A2E70',
    tone:      'cool',
  },
  completed: {
    fillStart: '#F2A058',
    fillEnd:   '#F08838',
    stroke:    '#9A4810',
    label:     '✓ 완료',
    labelBg:   'rgba(255, 255, 255, 0.95)',
    labelFg:   '#9A4810',
    tone:      'warm',
  },
  active_recent: {
    fillStart: '#FBD969',
    fillEnd:   '#F2B83A',
    stroke:    '#9A6810',
    label:     '★ 최근 작업',
    labelBg:   'rgba(255, 255, 255, 0.95)',
    labelFg:   '#9A6810',
    tone:      'warm',
    halo:      '#F2B83A',
  },
};

// 나무 색상 (어두운 갈색 톤, opacity 0.7 로 사용)
export const TREE_COLORS = {
  trunkGradient: ['#3D2810', '#6B4422', '#8E5A2E', '#5C3A1F', '#2D1A08'],
  branchGradient: ['#6B4422', '#4A2E18'],
  soil: '#4A2E18',
  soilHighlight: '#6B4422',
  bark:  'rgba(45, 26, 8, 0.4)', // 줄기 결무늬용 (얇은 세로 선)
};

// Chapter Entry 화면 톤 — 챕터 상태별 화면 배경/카드 테두리/CTA 색
export const ENTRY_TONE = {
  not_started: {
    bgGradient:   'linear-gradient(180deg, #FAFFF5 0%, #E8F2DD 100%)',
    accent:       '#5C8A3D',
    accentDark:   '#3A6E22',
    cardBorder:   '#D0E0BC',
    cardBorderHover: '#5C8A3D',
    fruitFill:    'url(#fruitNotStarted)',
    labelText:    '시작 안 함',
    ctaBg:        '#3A6E22',
    ctaBgHover:   '#2A5418',
  },
  in_progress: {
    // Tim 결정 (insight #30): 진행 중 챕터를 열면 자동으로 ★ 최근 작업 톤
    bgGradient:   'linear-gradient(180deg, #FFFAF0 0%, #F2E8D5 100%)',
    accent:       '#9A6810',
    accentDark:   '#5C4020',
    cardBorder:   '#F2B83A',
    cardBorderHover: '#9A6810',
    fruitFill:    'url(#fruitActiveRecent)',
    labelText:    '진행 중',
    ctaBg:        '#5C4020',
    ctaBgHover:   '#3A2A14',
  },
  completed: {
    bgGradient:   'linear-gradient(180deg, #FFFAF2 0%, #F5E8D5 100%)',
    accent:       '#F08838',
    accentDark:   '#9A4810',
    cardBorder:   '#F08838',
    cardBorderHover: '#9A4810',
    fruitFill:    'url(#fruitCompleted)',
    labelText:    '✓ 완료',
    ctaBg:        '#9A4810',
    ctaBgHover:   '#6E3008',
  },
  active_recent: {
    bgGradient:   'linear-gradient(180deg, #FFFAF0 0%, #F2E8D5 100%)',
    accent:       '#9A6810',
    accentDark:   '#5C4020',
    cardBorder:   '#F2B83A',
    cardBorderHover: '#9A6810',
    fruitFill:    'url(#fruitActiveRecent)',
    labelText:    '★ 최근 작업',
    ctaBg:        '#5C4020',
    ctaBgHover:   '#3A2A14',
  },
};

export function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.not_started;
}

export function getEntryTone(status) {
  return ENTRY_TONE[status] || ENTRY_TONE.not_started;
}

/**
 * SVG <defs> 그라데이션 ID 와 fill 매핑.
 * VisualTree.jsx 가 이 id 들에 매칭되는 <defs> 를 인라인으로 렌더한다.
 *
 * Status → fill url() 매핑 (Fruit.jsx 에서 사용).
 */
export const FRUIT_FILL_URL = {
  not_started:   'url(#fruitNotStarted)',
  in_progress:   'url(#fruitInProgress)',
  completed:     'url(#fruitCompleted)',
  active_recent: 'url(#fruitActiveRecent)',
};
