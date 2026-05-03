#!/usr/bin/env node
/**
 * scripts/test-emma-analysis.js  (Stage 1 — Task 88)
 *
 * Drives /api/chat/analyze-test with 10 hand-crafted scenarios and
 * prints a pass/fail report. Tim runs this locally after npm run dev:
 *
 *   ANALYZE_TEST_TOKEN=<jwt-from-browser-localStorage> \
 *     node scripts/test-emma-analysis.js
 *
 * Optional env:
 *   BASE_URL          (default http://localhost:3000)
 *   FAIL_FAST=1       stop on first failure
 *
 * 5 critical scenarios are flagged ⭐ and MUST all pass:
 *   #1 multi-dimension extraction
 *   #3 duplicate detection (newly_covered_dimensions empty)
 *   #4 wants_to_end recognition
 *   #5 의미 vs 경험 distinction
 *   #6 감정 ≠ 의미
 *
 * Overall pass bar: ≥ 8 / 10 scenarios + average latency ≤ 1500ms.
 */

const TOKEN    = process.env.ANALYZE_TEST_TOKEN;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FAIL_FAST = process.env.FAIL_FAST === '1';

if (!TOKEN) {
  console.error('ERROR: ANALYZE_TEST_TOKEN not set.');
  console.error('  Open the app in a browser, sign in, then in DevTools console:');
  console.error('    copy(localStorage.getItem("token"))');
  console.error('  Then re-run:  ANALYZE_TEST_TOKEN=<paste> node scripts/test-emma-analysis.js');
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────
// Scenarios

const SCENARIOS = [
  {
    id: 1,
    critical: true,
    name: '다중 차원 추출 (5 dims)',
    body: {
      question: '첫 직장 이야기 들려주세요',
      answer: '1985년 봄에 삼성전자에 들어갔어요. 부모님이 안정적인 회사를 추천해주셨고, 처음엔 신입으로 반도체 공정을 배웠죠. 같은 부서 김부장님이 정말 잘 챙겨주셨어요. 그때 배운 일이 평생 기반이 됐어요.',
    },
    expect(a) {
      const dims = new Set(a.covered_dimensions || []);
      const need = ['시작', '동기', '경험', '사람', '의미'];
      const missing = need.filter(d => !dims.has(d));
      return {
        ok: missing.length === 0 && a.answer_depth === 3,
        notes: [
          missing.length ? `missing dims: ${missing.join(',')}` : null,
          a.answer_depth !== 3 ? `expected depth=3 got ${a.answer_depth}` : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 2,
    critical: false,
    name: '단순 답변 (depth=1)',
    body: {
      question: '어디서 태어나셨어요?',
      answer: '부산이요',
    },
    expect(a) {
      const dims = a.covered_dimensions || [];
      return {
        ok: dims.includes('시작') && dims.length === 1 && a.answer_depth === 1,
        notes: [
          !dims.includes('시작') ? 'missing 시작' : null,
          dims.length !== 1 ? `expected 1 dim got ${dims.length}` : null,
          a.answer_depth !== 1 ? `expected depth=1 got ${a.answer_depth}` : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 3,
    critical: true,
    name: '⭐ 중복 검출 (newly_covered empty)',
    body: {
      question: '더 자세히 들려주세요',
      answer: '그래서 1985년에 삼성전자에 들어갔다고 했잖아요. 부모님 추천으로요.',
      history: [{
        question: '첫 직장 이야기 들려주세요',
        answer:   '1985년 봄에 삼성전자에 들어갔어요. 부모님이 추천해주셨어요.',
      }],
      previouslyCoveredDimensions: ['시작', '동기'],
    },
    expect(a) {
      const newly = a.newly_covered_dimensions || [];
      return {
        ok: newly.length === 0,
        notes: newly.length ? [`newly_covered should be empty, got [${newly.join(',')}]`] : [],
      };
    },
  },

  {
    id: 4,
    critical: true,
    name: '⭐ wants_to_end 인식',
    body: {
      question: '다음 챕터로 갈까요?',
      answer:   '오늘은 이 정도만 할까요. 좀 피곤하네요.',
    },
    expect(a) {
      return {
        ok: a.user_state === 'wants_to_end',
        notes: a.user_state !== 'wants_to_end' ? [`expected wants_to_end got ${a.user_state}`] : [],
      };
    },
  },

  {
    id: 5,
    critical: true,
    name: '⭐ 의미 vs 경험 구분',
    body: {
      question: '결혼식 이야기 들려주세요',
      answer:   '1990년에 결혼했어요. 작은 예식장에서 부모님과 친구들 앞에서요. 돌아보면 그 시간이 우리 인생의 시작점이었어요.',
    },
    expect(a) {
      const dims = new Set(a.covered_dimensions || []);
      return {
        ok: dims.has('경험') && dims.has('의미') && dims.has('사람'),
        notes: [
          !dims.has('경험') ? 'missing 경험' : null,
          !dims.has('의미') ? 'missing 의미' : null,
          !dims.has('사람') ? 'missing 사람' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 6,
    critical: true,
    name: '⭐ 감정 ≠ 의미',
    body: {
      question: '어머니 돌아가셨을 때 어땠어요?',
      answer:   '정말 슬펐어요. 너무 힘들었죠. 며칠 동안 잠을 못 잤어요.',
    },
    expect(a) {
      const dims = new Set(a.covered_dimensions || []);
      return {
        ok: dims.has('감정') && !dims.has('의미'),
        notes: [
          !dims.has('감정') ? 'missing 감정' : null,
          dims.has('의미') ? '의미 was tagged but answer is pure emotion' : null,
        ].filter(Boolean),
      };
    },
  },

  {
    id: 7,
    critical: false,
    name: 'emotional state',
    body: {
      question: '그때 기분은 어떠셨어요?',
      answer:   '지금도 생각하면 눈물이 나요. 정말 그리워요...',
    },
    expect(a) {
      return {
        ok: a.user_state === 'emotional',
        notes: a.user_state !== 'emotional' ? [`expected emotional got ${a.user_state}`] : [],
      };
    },
  },

  {
    id: 8,
    critical: false,
    name: 'wants_to_continue',
    body: {
      question: '다음 질문 드려도 될까요?',
      answer:   '네, 계속 해주세요. 더 이야기하고 싶어요.',
    },
    expect(a) {
      return {
        ok: a.user_state === 'wants_to_continue' || a.user_state === 'engaged',
        notes: !['wants_to_continue', 'engaged'].includes(a.user_state)
          ? [`expected wants_to_continue|engaged got ${a.user_state}`]
          : [],
      };
    },
  },

  {
    id: 9,
    critical: false,
    name: 'ungrounded_topics',
    body: {
      question: '그때 가족은 어떻게 지냈어요?',
      answer:   '다들 잘 지냈죠. 그 일 이후로 많이 달라졌어요.',
    },
    expect(a) {
      const u = a.ungrounded_topics || [];
      return {
        ok: u.length > 0,
        notes: u.length === 0 ? ['expected at least one ungrounded topic ("그 일")'] : [],
      };
    },
  },

  {
    id: 10,
    critical: false,
    name: 'tired state + depth=1',
    body: {
      question: '그래서 어떻게 됐어요?',
      answer:   '그냥... 잘 됐어요. 별거 아니에요.',
    },
    expect(a) {
      return {
        ok: a.user_state === 'tired' && a.answer_depth === 1,
        notes: [
          a.user_state !== 'tired' ? `expected tired got ${a.user_state}` : null,
          a.answer_depth !== 1 ? `expected depth=1 got ${a.answer_depth}` : null,
        ].filter(Boolean),
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Runner

async function callApi(body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat/analyze-test`, {
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
  console.log(bold(`\nEmma Analysis — Stage 1 verification`));
  console.log(dim(`  endpoint: ${BASE_URL}/api/chat/analyze-test`));
  console.log(dim(`  scenarios: ${SCENARIOS.length} (5 critical ⭐)\n`));

  const results = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`#${String(sc.id).padStart(2)} ${sc.critical ? '⭐' : '  '} ${sc.name.padEnd(36)} `);
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
    const analysis   = resp.data?.analysis;
    const validation = resp.data?.validation;
    const latencyMs  = resp.data?.latency_ms ?? resp.wallMs;
    if (!analysis) {
      console.log(red('NO_JSON'));
      console.log(dim(`     raw: ${(resp.data?.raw || '').slice(0, 200)}`));
      results.push({ id: sc.id, ok: false, critical: sc.critical, error: 'no_json', wallMs: latencyMs });
      if (FAIL_FAST) break;
      continue;
    }
    let outcome;
    try { outcome = sc.expect(analysis); }
    catch (e) { outcome = { ok: false, notes: [`expect threw: ${e.message}`] }; }
    const passed = outcome.ok && (validation?.valid ?? true);
    const tag    = passed ? green('PASS') : red('FAIL');
    console.log(`${tag}  ${dim(`(${latencyMs}ms)`)}`);
    if (!passed) {
      if (!validation?.valid) {
        console.log(dim(`     validation errors: ${(validation?.errors || []).join('; ')}`));
      }
      for (const n of outcome.notes || []) console.log(dim(`     ${n}`));
      console.log(dim(`     covered=${JSON.stringify(analysis.covered_dimensions)} newly=${JSON.stringify(analysis.newly_covered_dimensions)} state=${analysis.user_state} depth=${analysis.answer_depth}`));
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
  console.log(`  avg latency:      ${avgLatency} ms  ${avgLatency <= 1500 ? green('OK') : red('SLOW')}`);

  const overallOk = passed >= 8 && critPassed === critTotal && avgLatency <= 1500;
  console.log('\n' + (overallOk ? green(bold('STAGE 1 PASS — ready for Stage 2')) : red(bold('STAGE 1 NEEDS WORK'))));
  process.exit(overallOk ? 0 : 1);
}

run().catch(e => {
  console.error('runner error:', e);
  process.exit(2);
});
