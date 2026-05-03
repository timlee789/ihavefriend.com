#!/usr/bin/env node
/**
 * scripts/test-emma-decision.js  (Stage 2 — Task 89)
 *
 * Drives /api/chat/decide-test with 12 hand-crafted scenarios and
 * prints a pass/fail report. Reuses the Stage-1 token env var.
 *
 *   ANALYZE_TEST_TOKEN=<jwt-from-browser-localStorage> \
 *     node scripts/test-emma-decision.js
 *
 * Optional env:
 *   BASE_URL          (default http://localhost:3000)
 *   FAIL_FAST=1       stop on first failure
 *
 * Critical scenarios (must all pass):
 *   #1  book mode rich answer → gentle_nudge
 *   #3  newly_covered empty + previously covered → no re-asking covered ⭐⭐
 *   #4  wants_to_end → acknowledge_only, no question mark
 *   #6  story mode rich engaged → wait_listen
 *   #11 LAST=follow_up_specific(X) + same ungrounded X → don't repeat
 *
 * Pass bar: ≥ 10/12 + critical 5/5 + avg latency ≤ 2000ms.
 */

const TOKEN    = process.env.ANALYZE_TEST_TOKEN;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FAIL_FAST = process.env.FAIL_FAST === '1';

if (!TOKEN) {
  console.error('ERROR: ANALYZE_TEST_TOKEN not set.');
  console.error('  In browser DevTools after login: copy(localStorage.getItem("token"))');
  console.error('  Then re-run:  ANALYZE_TEST_TOKEN=<paste> node scripts/test-emma-decision.js');
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────
// Helpers

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;
const SPANISH_HINT = /[ñáéíóúüÑÁÉÍÓÚÜ¿¡]/;

function detectLang(s) {
  if (!s) return null;
  if (HANGUL.test(s)) return 'ko';
  if (SPANISH_HINT.test(s)) return 'es';
  // crude: if mostly ASCII letters with Spanish stopwords → 'es', else 'en'
  const lc = s.toLowerCase();
  if (/\b(que|el|la|los|las|un|una|y|de|en|con|para|por|es|está|estaba|cómo)\b/.test(lc)) {
    return 'es';
  }
  return 'en';
}

function looksLikeQuestion(s) {
  if (typeof s !== 'string') return false;
  return /[?？]/.test(s.trim());
}

// ─────────────────────────────────────────────────────────────
// Scenarios

const RICH_ANSWER_KO = '1985년 봄에 삼성전자에 들어갔어요. 부모님이 추천해주셨고, 김부장님께 많이 배웠죠. 그때가 제 인생의 기반이 됐어요.';
const RICH_ANALYSIS_KO_FULL = {
  covered_dimensions: ['시작','동기','경험','사람','의미'],
  newly_covered_dimensions: ['시작','동기','경험','사람','의미'],
  mentioned_details: ['1985년 봄','삼성전자','김부장님'],
  answer_depth: 3,
  user_state: 'engaged',
  ungrounded_topics: [],
  answer_summary: '1985년 삼성전자 입사',
};

const SCENARIOS = [
  {
    id: 1,
    critical: true,
    name: '⭐ book rich → gentle_nudge',
    body: {
      mode: 'book', lang: 'ko',
      question: '첫 직장 이야기 들려주세요',
      answer: RICH_ANSWER_KO,
      analysis: RICH_ANALYSIS_KO_FULL,
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = d.action === 'gentle_nudge'
              && typeof d.suggested_response === 'string'
              && d.suggested_response.trim().length > 0;
      return {
        ok,
        notes: [
          d.action !== 'gentle_nudge' ? `expected gentle_nudge got ${d.action}` : null,
          (typeof d.suggested_response !== 'string' || !d.suggested_response.trim())
            ? 'suggested_response must be non-empty' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 2,
    critical: false,
    name: 'book minimal answer → follow_up or gentle_nudge',
    body: {
      mode: 'book', lang: 'ko',
      question: '어디서 태어나셨어요?',
      answer: '부산이요',
      analysis: {
        covered_dimensions: ['시작'],
        newly_covered_dimensions: ['시작'],
        mentioned_details: ['부산'],
        answer_depth: 1,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: '부산에서 태어남',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = ['follow_up_specific','follow_up_deeper','gentle_nudge'].includes(d.action);
      return { ok, notes: ok ? [] : [`expected follow_up_specific|follow_up_deeper|gentle_nudge got ${d.action}`] };
    },
  },

  {
    id: 3,
    critical: true,
    name: '⭐⭐ newly empty + previously covered → no re-ask covered',
    body: {
      mode: 'book', lang: 'ko',
      question: '더 자세히 들려주세요',
      answer: '그래서 1985년에 삼성전자에 들어갔다고 했잖아요. 부모님 추천으로요.',
      analysis: {
        covered_dimensions: ['시작','동기'],
        newly_covered_dimensions: [],
        mentioned_details: ['1985년','삼성전자'],
        answer_depth: 1,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: '같은 답 반복',
      },
      previouslyCoveredDimensions: ['시작','동기'],
      lastEmmaAction: { action: 'follow_up_specific', ground_in: null, target_dimension: '동기' },
    },
    expect(d) {
      const previouslyCovered = new Set(['시작','동기']);
      const reAsksCovered =
        d.action === 'follow_up_specific' &&
        d.target_dimension && previouslyCovered.has(d.target_dimension);
      const targetIsNew = !d.target_dimension || !previouslyCovered.has(d.target_dimension);
      const ok = !reAsksCovered && targetIsNew && d.action !== 'follow_up_specific';
      return {
        ok,
        notes: [
          reAsksCovered ? `re-asks already-covered dim "${d.target_dimension}"` : null,
          d.action === 'follow_up_specific' ? 'should not follow_up_specific when newly_covered is empty' : null,
          (d.target_dimension && previouslyCovered.has(d.target_dimension))
            ? `target_dimension "${d.target_dimension}" is in previouslyCovered` : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 4,
    critical: true,
    name: '⭐ wants_to_end → acknowledge_only, no question',
    body: {
      mode: 'book', lang: 'ko',
      question: '다음 챕터로 갈까요?',
      answer: '오늘은 이 정도만 할까요. 좀 피곤하네요.',
      analysis: {
        covered_dimensions: [],
        newly_covered_dimensions: [],
        mentioned_details: [],
        answer_depth: 1,
        user_state: 'wants_to_end',
        ungrounded_topics: [],
        answer_summary: '오늘은 그만하고 싶음',
      },
      previouslyCoveredDimensions: ['시작','경험'],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = d.action === 'acknowledge_only' && !looksLikeQuestion(d.suggested_response);
      return {
        ok,
        notes: [
          d.action !== 'acknowledge_only' ? `expected acknowledge_only got ${d.action}` : null,
          looksLikeQuestion(d.suggested_response) ? 'suggested_response contains a question mark' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 5,
    critical: false,
    name: 'emotional → acknowledge_only or wait_listen, no question',
    body: {
      mode: 'book', lang: 'ko',
      question: '그때 기분은 어떠셨어요?',
      answer: '지금도 생각하면 눈물이 나요. 정말 그리워요...',
      analysis: {
        covered_dimensions: ['감정'],
        newly_covered_dimensions: ['감정'],
        mentioned_details: [],
        answer_depth: 2,
        user_state: 'emotional',
        ungrounded_topics: [],
        answer_summary: '지금도 그리움이 남음',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = ['acknowledge_only','wait_listen','gentle_nudge'].includes(d.action)
              && (d.action !== 'acknowledge_only' || !looksLikeQuestion(d.suggested_response));
      return {
        ok,
        notes: [
          !['acknowledge_only','wait_listen','gentle_nudge'].includes(d.action)
            ? `expected acknowledge_only|wait_listen|gentle_nudge got ${d.action}` : null,
          (d.action === 'acknowledge_only' && looksLikeQuestion(d.suggested_response))
            ? 'acknowledge_only contains question mark' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 6,
    critical: true,
    name: '⭐ story mode rich engaged → wait_listen',
    body: {
      mode: 'story', lang: 'ko',
      question: '어떻게 시작됐어요?',
      answer: '그게 1992년 가을이었는데, 그때 저는 제주도에 살고 있었어요. 처음엔 산책 나갔다가 우연히 그 사람을 만났죠.',
      analysis: {
        covered_dimensions: ['시작','경험','사람','감정'],
        newly_covered_dimensions: ['시작','경험','사람','감정'],
        mentioned_details: ['1992년 가을','제주도','산책'],
        answer_depth: 3,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: '1992년 제주도 산책 중 만남',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = d.action === 'wait_listen' && (d.suggested_response === null || d.suggested_response === '');
      return {
        ok,
        notes: [
          d.action !== 'wait_listen' ? `expected wait_listen got ${d.action}` : null,
          (d.suggested_response !== null && d.suggested_response !== '')
            ? 'wait_listen requires suggested_response=null' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 7,
    critical: false,
    name: 'story mode short stall → follow_up_specific or gentle_nudge',
    body: {
      mode: 'story', lang: 'ko',
      question: '그래서 어떻게 됐어요?',
      answer: '음... 잘 모르겠어요.',
      analysis: {
        covered_dimensions: [],
        newly_covered_dimensions: [],
        mentioned_details: [],
        answer_depth: 1,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: '잘 모르겠다는 답',
      },
      previouslyCoveredDimensions: ['시작'],
      lastEmmaAction: null,
    },
    expect(d) {
      const ok = ['follow_up_specific','follow_up_deeper','gentle_nudge','wait_listen','acknowledge_only'].includes(d.action);
      return { ok, notes: ok ? [] : [`unexpected action ${d.action}`] };
    },
  },

  {
    id: 8,
    critical: false,
    name: 'companion mode → no narrative follow-ups',
    body: {
      mode: 'companion', lang: 'ko',
      question: '오늘 하루 어떠셨어요?',
      answer: '그냥 평소처럼 보냈어요. 아침엔 산책 좀 하고요.',
      analysis: {
        covered_dimensions: ['경험'],
        newly_covered_dimensions: ['경험'],
        mentioned_details: ['아침 산책'],
        answer_depth: 2,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: '평소같은 하루',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      // companion mode is not narrative-driven — neither follow_up_*
      // action is appropriate per the prompt's mode priorities.
      const narrativeFollow = d.action === 'follow_up_specific' || d.action === 'follow_up_deeper';
      return {
        ok: !narrativeFollow,
        notes: narrativeFollow ? [`companion mode should not use ${d.action}`] : [],
      };
    },
  },

  {
    id: 9,
    critical: false,
    name: 'book ungrounded → follow_up_specific, ground_in matches',
    body: {
      mode: 'book', lang: 'ko',
      question: '그때 가족은 어떻게 지냈어요?',
      answer: '다들 잘 지냈죠. 그 일 이후로 많이 달라졌어요.',
      analysis: {
        covered_dimensions: ['사람'],
        newly_covered_dimensions: ['사람'],
        mentioned_details: [],
        answer_depth: 1,
        user_state: 'engaged',
        ungrounded_topics: ['그 일'],
        answer_summary: '가족이 잘 지냈고 어떤 사건 이후 변함',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const groundOk = d.action === 'follow_up_specific'
        && typeof d.ground_in === 'string'
        && d.ground_in.includes('그 일');
      return {
        ok: groundOk,
        notes: [
          d.action !== 'follow_up_specific' ? `expected follow_up_specific got ${d.action}` : null,
          (d.action === 'follow_up_specific' && (typeof d.ground_in !== 'string' || !d.ground_in.includes('그 일')))
            ? `ground_in should reference "그 일", got ${JSON.stringify(d.ground_in)}` : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 10,
    critical: false,
    name: 'EN book rich → gentle_nudge in English',
    body: {
      mode: 'book', lang: 'en',
      question: 'Tell me about your first job.',
      answer: 'I joined Samsung in spring 1985. My parents recommended it because it was stable. I learned semiconductor processes from Mr. Kim. Looking back, that became the foundation of my life.',
      analysis: {
        covered_dimensions: ['시작','동기','경험','사람','의미'],
        newly_covered_dimensions: ['시작','동기','경험','사람','의미'],
        mentioned_details: ['spring 1985','Samsung','Mr. Kim','semiconductor processes'],
        answer_depth: 3,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: 'Joined Samsung in 1985, learned from Mr. Kim',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      const langOk = detectLang(d.suggested_response) === 'en';
      const ok = d.action === 'gentle_nudge' && langOk;
      return {
        ok,
        notes: [
          d.action !== 'gentle_nudge' ? `expected gentle_nudge got ${d.action}` : null,
          !langOk ? `expected English suggested_response, got: ${JSON.stringify(d.suggested_response)}` : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 11,
    critical: true,
    name: '⭐ LAST=follow_up_specific(X) + same ungrounded X → no repeat',
    body: {
      mode: 'book', lang: 'ko',
      question: '그 일이 뭐였어요?',
      answer: '아니 그게 그 일이에요. 그 일 이후로요.',
      analysis: {
        covered_dimensions: [],
        newly_covered_dimensions: [],
        mentioned_details: [],
        answer_depth: 1,
        user_state: 'engaged',
        ungrounded_topics: ['그 일'],
        answer_summary: '여전히 그 일을 설명 안 함',
      },
      previouslyCoveredDimensions: ['사람'],
      lastEmmaAction: { action: 'follow_up_specific', ground_in: '그 일', target_dimension: '경험' },
    },
    expect(d) {
      const repeated = d.action === 'follow_up_specific' && (d.ground_in === '그 일' || (d.ground_in || '').includes('그 일'));
      const ok = !repeated;
      return {
        ok,
        notes: repeated ? [`repeated follow_up_specific on same ground_in "그 일"`] : [],
      };
    },
  },

  {
    id: 12,
    critical: false,
    name: 'ES companion → Spanish suggested_response',
    body: {
      mode: 'companion', lang: 'es',
      question: '¿Cómo estás hoy?',
      answer: 'Bien, gracias. Hoy fui a caminar por la mañana.',
      analysis: {
        covered_dimensions: ['경험'],
        newly_covered_dimensions: ['경험'],
        mentioned_details: ['caminar por la mañana'],
        answer_depth: 2,
        user_state: 'engaged',
        ungrounded_topics: [],
        answer_summary: 'Caminata matutina',
      },
      previouslyCoveredDimensions: [],
      lastEmmaAction: null,
    },
    expect(d) {
      // wait_listen has null suggested_response — skip lang check
      if (d.action === 'wait_listen') {
        return { ok: true, notes: [] };
      }
      const lang = detectLang(d.suggested_response);
      const ok = lang === 'es';
      return {
        ok,
        notes: ok ? [] : [`expected Spanish suggested_response, got lang=${lang}: ${JSON.stringify(d.suggested_response)}`],
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Runner

async function callApi(body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat/decide-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const wallMs = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data, wallMs };
}

function color(code, str) {
  if (!process.stdout.isTTY) return str;
  return `\x1b[${code}m${str}\x1b[0m`;
}
const green = s => color(32, s);
const red   = s => color(31, s);
const dim   = s => color(2,  s);
const bold  = s => color(1,  s);

async function run() {
  console.log(bold(`\nEmma Decision — Stage 2 verification`));
  console.log(dim(`  endpoint: ${BASE_URL}/api/chat/decide-test`));
  console.log(dim(`  scenarios: ${SCENARIOS.length} (5 critical ⭐)\n`));

  const results = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`#${String(sc.id).padStart(2)} ${sc.critical ? '⭐' : '  '} ${sc.name.padEnd(56)} `);
    let resp;
    try {
      resp = await callApi(sc.body);
    } catch (e) {
      console.log(red(`HTTP ERROR — ${e.message}`));
      results.push({ id: sc.id, ok: false, critical: sc.critical, error: e.message, wallMs: 0 });
      if (FAIL_FAST) break;
      continue;
    }
    if (!resp.ok) {
      console.log(red(`HTTP ${resp.status}`));
      console.log(dim(`     ${JSON.stringify(resp.data).slice(0, 200)}`));
      results.push({ id: sc.id, ok: false, critical: sc.critical, error: `http ${resp.status}`, wallMs: resp.wallMs });
      if (FAIL_FAST) break;
      continue;
    }
    const decision   = resp.data?.decision;
    const validation = resp.data?.validation;
    const latencyMs  = resp.data?.latency_ms ?? resp.wallMs;
    if (!decision) {
      console.log(red('NO_JSON'));
      console.log(dim(`     raw: ${(resp.data?.raw || '').slice(0, 200)}`));
      results.push({ id: sc.id, ok: false, critical: sc.critical, error: 'no_json', wallMs: latencyMs });
      if (FAIL_FAST) break;
      continue;
    }
    let outcome;
    try { outcome = sc.expect(decision); }
    catch (e) { outcome = { ok: false, notes: [`expect threw: ${e.message}`] }; }
    const passed = outcome.ok && (validation?.valid ?? true);
    const tag    = passed ? green('PASS') : red('FAIL');
    console.log(`${tag}  ${dim(`(${latencyMs}ms)`)}`);
    if (!passed) {
      if (!validation?.valid) {
        console.log(dim(`     validation errors: ${(validation?.errors || []).join('; ')}`));
      }
      for (const n of outcome.notes || []) console.log(dim(`     ${n}`));
      console.log(dim(`     action=${decision.action} target=${decision.target_dimension} ground=${JSON.stringify(decision.ground_in)} resp=${JSON.stringify(decision.suggested_response)?.slice(0,80)}`));
    }
    results.push({
      id: sc.id, ok: passed, critical: sc.critical, wallMs: latencyMs,
      validationOk: validation?.valid, notes: outcome.notes || [],
    });
    if (!passed && FAIL_FAST) break;
  }

  // Summary
  const total      = results.length;
  const passed     = results.filter(r => r.ok).length;
  const critPassed = results.filter(r => r.ok && r.critical).length;
  const critTotal  = SCENARIOS.filter(s => s.critical).length;
  const avgLatency = results.length ? Math.round(results.reduce((a, r) => a + (r.wallMs || 0), 0) / results.length) : 0;

  console.log('\n' + bold('Summary'));
  console.log(`  passed:           ${passed} / ${total}  (${Math.round(100 * passed / total)}%)`);
  console.log(`  critical passed:  ${critPassed} / ${critTotal}  ${critPassed === critTotal ? green('OK') : red('MISS')}`);
  console.log(`  avg latency:      ${avgLatency} ms  ${avgLatency <= 2000 ? green('OK') : red('SLOW')}`);

  const overallOk = passed >= 10 && critPassed === critTotal && avgLatency <= 2000;
  console.log('\n' + (overallOk ? green(bold('STAGE 2 PASS — ready for Stage 3')) : red(bold('STAGE 2 NEEDS WORK'))));
  process.exit(overallOk ? 0 : 1);
}

run().catch(e => {
  console.error('runner error:', e);
  process.exit(2);
});
