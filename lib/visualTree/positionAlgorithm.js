/**
 * lib/visualTree/positionAlgorithm.js
 *
 * Visual Tree 의 챕터 잎 배치 알고리즘.
 *
 * 좌표 생성은 챕터 수 N 기반으로 매번 동적 계산 (지그재그 + 자동 압축).
 * 챕터 추가/삭제 시 빈 자리 없이 항상 깔끔한 트리.
 *
 * 패턴:
 *   - ★ 최근 작업: y=250 (맨 위, 통계 카드 아래)
 *   - 일반 챕터: 좌우 페어 × N/2 단, 짝수단 tight / 홀수단 wide (지그재그)
 *   - 단 수가 많으면 spacing 자동 압축으로 viewBox (1380) 내 fit
 */

// SVG viewBox: 680 × 1380. 좌표는 모두 그 안.
//   - 줄기 중심선: x = 340
//   - ★ 최근 작업: y 250 — 통계 카드와 ~150px 여백
//   - 일반 잎: y 470 ~ 1180 — ★ 아래로 차곡차곡
//   - 흙 + 뿌리: y 1280

/**
 * V2 API 의 챕터를 V3 상태로 raw 매핑 (단일 챕터만 본다).
 * is_current 가 어떤 챕터에도 안 붙어 있을 수 있어서 classifyChapters() 가
 * 한 번 더 보정한다.
 */
function rawClassify(ch) {
  if (ch.status === 'complete') return 'completed';
  if (ch.status === 'in_progress') {
    return ch.is_current ? 'active_recent' : 'in_progress';
  }
  return 'not_started';
}

/**
 * 전체 챕터 배열을 본 다음 V3 상태를 확정.
 *
 * 보정 규칙:
 *   - is_current === true 인 챕터가 있으면 그것이 active_recent (기본).
 *   - is_current 가 어디에도 없는데 in_progress 챕터가 있으면
 *     그중 하나를 active_recent 로 자동 승격.
 *
 * 승격 우선순위:
 *   1) chapter.last_active_at 가 있다면 가장 최근 — V2 가 챕터별로 안 주면 skip
 *   2) order 가 가장 큰 챕터 (가장 늦게 만든 = 가장 최근 작업 가능성 높음)
 *
 * 영구 통찰 #30: "화면을 여는 행위 자체가 의도 선언" 의 보강 —
 * Visual Tree 에서도 ★ 1개는 항상 보여 사용자가 "여기서 이어 쓰면 되는구나" 인지.
 */
export function classifyChapters(chapters) {
  let enriched = chapters.map(ch => ({ ...ch, v3Status: rawClassify(ch) }));

  const hasActive = enriched.some(c => c.v3Status === 'active_recent');
  if (hasActive) return enriched;

  const inProgressList = enriched.filter(c => c.v3Status === 'in_progress');
  if (inProgressList.length === 0) return enriched;

  const promote = [...inProgressList].sort((a, b) => {
    const aT = a.last_active_at ? new Date(a.last_active_at).getTime() : 0;
    const bT = b.last_active_at ? new Date(b.last_active_at).getTime() : 0;
    if (aT !== bT) return bT - aT;
    return (b.order ?? 0) - (a.order ?? 0);
  })[0];

  return enriched.map(c =>
    c.id === promote.id ? { ...c, v3Status: 'active_recent' } : c
  );
}

/**
 * @deprecated — 호환용. classifyChapters 가 한 번에 처리하므로 이건 단일 챕터만 raw 매핑.
 */
export function getChapterStatus(chapter) {
  return rawClassify(chapter);
}

// Step 1g — 새 레이아웃 + 챕터 수 제한 17.
//   * 첫 단: ★ 잎 + 양옆 2개 (★ y=210, 좌우 y=210)
//   * 둘째 단부터: 기존 지그재그 패턴
//   * MAX_CHAPTERS = 17 (★ 1 + 첫 단 2 + 7쌍 14)
//
// Step 1h (2026-05-19) — 통계 카드와 트리 간격 축소:
//   * ACTIVE_TOP y 300→210 (위로 90), SECOND_ROW_Y 470→400
//   * 첫 단 좌우 잎: 130/550 → 110/570 (★ 와 떨어져 가로 가지에 매달림)
//   * ROWS_TIGHT/WIDE 도 더 바깥쪽으로
export const MAX_CHAPTERS = 17;

const ACTIVE_TOP_POSITION = { x: 340, y: 210 };
const FIRST_ROW_LEFT      = { x: 110, y: 210 };
const FIRST_ROW_RIGHT     = { x: 570, y: 210 };

const SECOND_ROW_Y = 400;   // 둘째 단 (첫 단 y=210 + 190)
const MAX_Y        = 1180;  // 마지막 잎 y 상한
const ROW_SPACING  = 140;
const ROWS_TIGHT   = { left: 175, right: 505 };  // 더 바깥쪽 (Step 1h)
const ROWS_WIDE    = { left:  90, right: 590 };  // SVG 가장자리 가까이 (Step 1h)

/**
 * 일반 챕터 (★ 제외) N개에 대한 좌표 동적 생성.
 *
 * 새 레이아웃 (Step 1g):
 *   - 첫 단 (★ 양옆, y=300): 잎 0 = FIRST_ROW_LEFT, 잎 1 = FIRST_ROW_RIGHT
 *   - 둘째 단부터 (i>=2): 좌우 페어 × N/2 단, 지그재그 (TIGHT/WIDE 교대)
 *   - 단 수가 많아 SECOND_ROW_Y ~ MAX_Y 안에 안 들어가면 자동 압축
 *   - 홀수 잎 수 (둘째 단 이후) 면 마지막 단은 좌측 한 잎만
 */
function generatePositions(count) {
  const positions = [];
  if (count <= 0) return positions;

  // 첫 단 — ★ 양옆 (최대 2개)
  if (count >= 1) positions.push(FIRST_ROW_LEFT);
  if (count >= 2) positions.push(FIRST_ROW_RIGHT);

  // 둘째 단부터 (인덱스 2~)
  const remaining = count - 2;
  if (remaining <= 0) return positions;

  const numRowsAfterFirst = Math.ceil(remaining / 2);
  const rowSpacing = numRowsAfterFirst > 1
    ? Math.min(ROW_SPACING, (MAX_Y - SECOND_ROW_Y) / (numRowsAfterFirst - 1))
    : ROW_SPACING;

  for (let i = 0; i < remaining; i++) {
    const row       = Math.floor(i / 2);
    const isLeft    = i % 2 === 0;
    const rowConfig = row % 2 === 0 ? ROWS_TIGHT : ROWS_WIDE;
    positions.push({
      x: isLeft ? rowConfig.left : rowConfig.right,
      y: SECOND_ROW_Y + row * rowSpacing,
    });
  }
  return positions;
}

/**
 * is_active 챕터 수 카운트 — 17개 limit check 에 사용.
 */
export function getActiveChapterCount(chapters) {
  if (!Array.isArray(chapters)) return 0;
  return chapters.filter(ch => ch.is_active !== false).length;
}

/**
 * 각 챕터에 좌표와 V3 상태를 할당.
 *
 * @param {Array} chapters - V2 API 의 chapters 배열
 * @returns {Array} - [{ ...chapter, v3Status, position: {x, y} }, ...]
 *
 * 동작:
 *   1. 각 챕터의 V3 status 계산
 *   2. ★ 최근 작업 챕터 (있다면) → 뿌리 자리 (y=1020) 로
 *   3. 나머지 챕터들 → MODE_* 의 위에서부터 채움
 *      (챕터 order 순서 유지)
 *   4. 모드 결정: 챕터 총 개수 (★ 포함) 기준
 */
export function assignPositions(chapters) {
  if (!Array.isArray(chapters) || chapters.length === 0) return [];

  // 1단계: 전체를 본 다음 V3 상태 부여 (active_recent fallback 포함)
  const enriched = classifyChapters(chapters);

  // 2단계: ★ 최근 작업 분리
  const activeIdx = enriched.findIndex(ch => ch.v3Status === 'active_recent');
  const activeCh  = activeIdx >= 0 ? enriched[activeIdx] : null;
  const others    = activeIdx >= 0
    ? enriched.filter((_, i) => i !== activeIdx)
    : enriched;

  // 3단계: 일반 챕터 수 만큼 좌표 동적 생성 (지그재그 + 자동 압축).
  //   기존 MODE_A/B 고정 배열은 챕터 삭제/추가 시 빈 자리/짝 안 맞는
  //   문제 유발 → 매번 N 기반 재계산으로 항상 깔끔하게.
  const pool = generatePositions(others.length);

  // 4단계: order 순으로 정렬 후 위에서부터 자리 채우기
  const sorted = [...others].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const placed = sorted.map((ch, i) => ({
    ...ch,
    position: pool[i] || pool[pool.length - 1] || ACTIVE_TOP_POSITION, // safety
  }));

  // 5단계: ★ 최근 작업 챕터를 맨 위 자리에 추가 (스크롤 없이 인지)
  if (activeCh) {
    placed.push({ ...activeCh, position: ACTIVE_TOP_POSITION });
  }

  return placed;
}

/**
 * 통계 카운트 — StatsCard 에서 사용.
 * classifyChapters 와 같은 보정을 거쳐서 잎과 통계의 분류가 일치하도록.
 */
export function getChapterStats(chapters) {
  const stats = { not_started: 0, in_progress: 0, completed: 0, total: 0 };
  const enriched = classifyChapters(chapters || []);
  for (const ch of enriched) {
    stats.total++;
    if (ch.v3Status === 'completed') stats.completed++;
    else if (ch.v3Status === 'in_progress' || ch.v3Status === 'active_recent') stats.in_progress++;
    else stats.not_started++;
  }
  return stats;
}
