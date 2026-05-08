/**
 * lib/architect/categoryHints.js
 *
 * Map common Korean keywords → chapter_library / question_library
 * `category` enum so the matching endpoints can fall back to category
 * search when GIN tag matches under-fill the result page.
 *
 * The 9 category buckets mirror chapter_library.category exactly:
 *   childhood / youth / marriage / work / children
 *   immigration / faith / relationships / legacy
 *
 * Strategy: STRATEGY-architect-bot-final-2026-05-07.md (이 파일은 §매칭
 *   알고리즘의 "category 보강" 단계가 사용)
 *
 * 디자인 원칙:
 *   - 사용자가 자주 던지는 한국어 표현만 1차 매핑 (영문/스페인어는 별도)
 *   - 한 키워드 → 하나의 가장 강한 category. 모호한 단어 (예: "친구") 는
 *     명확한 항목만 (relationships) 으로 보냄. 약한 매핑은 추가 안 함.
 *   - 확장 시: 단어 → category 한 줄 추가. 우선순위는 알 수 없으므로
 *     첫 매치 우선 (Map iteration order = insertion order).
 *
 * 사용:
 *   const { categoriesFromKeywords } = require('./categoryHints');
 *   categoriesFromKeywords(['시골', '어린', '농촌'])
 *     → ['childhood']  (중복 제거됨)
 */

const KEYWORD_CATEGORY = {
  // 어린 시절 (childhood)
  '어린':       'childhood',
  '어린시절':   'childhood',
  '어렸을':     'childhood',
  '시골':       'childhood',
  '농촌':       'childhood',
  '동네':       'childhood',
  '학교':       'childhood',
  '학창':       'childhood',
  '동무':       'childhood',
  '명절':       'childhood',
  '어머니':     'childhood',
  '아버지':     'childhood',
  '부모님':     'childhood',
  '형제':       'childhood',
  '자매':       'childhood',
  '한국전쟁':   'childhood',

  // 청년기 (youth)
  '청년':       'youth',
  '청춘':       'youth',
  '청소년':     'youth',
  '대학':       'youth',
  '군대':       'youth',
  '첫사랑':     'youth',
  '서울':       'youth',
  '객지':       'youth',
  '자취':       'youth',
  '꿈':         'youth',

  // 결혼 (marriage)
  '결혼':       'marriage',
  '신혼':       'marriage',
  '배우자':     'marriage',
  '남편':       'marriage',
  '아내':       'marriage',
  '시집':       'marriage',
  '처가':       'marriage',
  '결혼식':     'marriage',
  '부부':       'marriage',

  // 일/사업 (work)
  '일':         'work',
  '직장':       'work',
  '사업':       'work',
  '회사':       'work',
  '동료':       'work',
  '멘토':       'work',
  '은퇴':       'work',
  '전환':       'work',

  // 자녀 (children)
  '자녀':       'children',
  '아이':       'children',
  '아들':       'children',
  '딸':         'children',
  '아기':       'children',
  '손주':       'children',
  '손자':       'children',
  '손녀':       'children',
  '출산':       'children',
  '사춘기':     'children',

  // 이민 (immigration)
  '이민':       'immigration',
  '미국':       'immigration',
  '이민자':     'immigration',
  '두고향':     'immigration',
  '고향':       'immigration',
  '한국떠나':   'immigration',
  '문화':       'immigration',

  // 신앙 (faith)
  '신앙':       'faith',
  '교회':       'faith',
  '믿음':       'faith',
  '기도':       'faith',
  '봉사':       'faith',
  '나눔':       'faith',
  '깨달음':     'faith',

  // 인간관계 (relationships)
  '친구':       'relationships',
  '우정':       'relationships',
  '여행':       'relationships',
  '취미':       'relationships',
  '병':         'relationships',
  '회복':       'relationships',

  // 유산 / 후세 (legacy)
  '유산':       'legacy',
  '후세':       'legacy',
  '가풍':       'legacy',
  '교훈':       'legacy',
  '다시산다면': 'legacy',
  '전하고싶':   'legacy',
  '평범한':     'legacy',
  '황혼':       'legacy',
  '사별':       'legacy',
};

/**
 * Map an array of keywords to a deduplicated array of category strings.
 * Unknown keywords are dropped silently. The result preserves first-seen
 * order so the caller can use it as a soft priority hint.
 *
 * @param {string[]} keywords
 * @returns {string[]}  e.g. ['childhood', 'youth']
 */
function categoriesFromKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of keywords) {
    const k = String(raw || '').trim();
    if (!k) continue;
    // Try exact, then a couple of common normalizations the lookup
    // table doesn't bother encoding (ws + 시절/들 suffixes).
    const candidates = [
      k,
      k.replace(/시절$/, ''),
      k.replace(/들$/, ''),
      k.replace(/\s+/g, ''),
    ];
    for (const cand of candidates) {
      const cat = KEYWORD_CATEGORY[cand];
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        out.push(cat);
        break;
      }
    }
  }
  return out;
}

/** Returns true if the given category is one of the 9 known buckets. */
function isKnownCategory(cat) {
  return new Set([
    'childhood', 'youth', 'marriage', 'work', 'children',
    'immigration', 'faith', 'relationships', 'legacy',
  ]).has(cat);
}

module.exports = { KEYWORD_CATEGORY, categoriesFromKeywords, isKnownCategory };
