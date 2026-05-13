'use client';

/**
 * /pricing — 가격 안내 페이지 (Sprint 2k, 2026-05-11).
 *
 * Anonymous open (Sprint 2i 패턴) — auth gate X. CTA 클릭 시점에
 * logged-in 상태에 따라 동작 분기. 한국어 자녀→부모 톤. 영어/스페인어
 * "Coming Soon" (Tim 결정 5-A, 베타는 한국어 우선).
 *
 * Sprint 2k Tim 결정:
 *   1-A. 베타 = admin grant (Stripe = Phase 5+)
 *   2-A+C. /pricing 페이지 + /architect 가격 섹션
 *   3-A. QuotaModal "정식 등록" → /pricing navigation
 *   4-A. Tim 의 admin 수동 처리 (5 명)
 *   5-A. 영어/스페인어 = "Coming Soon"
 *
 * 헤더: Sprint 2f 의 2-row 표준. Hero + 3 tier 카드 + 환불 + Why 5 Moats.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserPlan } from '@/components/auth/useUserPlan';
import s from './page.module.css';

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

// ─────────────────────────────────────────────────────────────────
// i18n — KO 정식, EN/ES 는 Coming Soon 톤 (Tim 결정 5-A)
// ─────────────────────────────────────────────────────────────────
const PRICING_MSGS = {
  KO: {
    backHome      : '← 홈으로',
    title         : '💰 가격 안내',

    heroLead      : '부모님의 인생을 책으로',
    heroDesc      : '매년 부모님께 카네이션 한 송이만 드리시나요?\n6개월 동안 매일 대화하며 200-300페이지 화보집을 선물하세요.',

    // 🔥 Sprint 2V (2026-05-13) — Pricing V4 (Tim 10 결정):
    //   - Trial: 시간 ↓ (10→5분), 책 작성 가능 (인쇄만 X, 결정 9-B).
    //   - Premium: "무제한" 표현 X (진실됨, Tim 영구 원칙).
    //     "AI Emma 와 대화로 글 만들기 (일 60분 / 월 30시간)" — brand
    //     promise (🎙️ → 📘) 의 텍스트 표현 (결정 ⭐).
    //   - Special slot → 📷 사진책 만들기 Coming Soon (결정 4).
    //   - 평생 lock-in 표현 제거 (결정 5, 진실됨).
    //   - 베타 mention 제거 (베타 = admin 수동 grant, 별도, 결정 2).

    // Trial card
    trialBadge    : '🌱 Trial',
    trialPrice    : '무료',
    trialSubtitle : '지금 바로 시작',
    trialPerks    : [
      'AI Emma 와 5분 대화 (일)',
      '이야기 5개 (테스트)',
      '사진 3장 (테스트)',
      '자서전 / 이야기책 작성 (미리 보기)',
      '30일 데이터 보존',
      '⚠️ 책 인쇄 발주는 Premium 만',
    ],
    trialCta      : '🌱 무료 Trial 시작하기',
    trialAlready  : '이미 사용 중이세요 😊',

    // Premium card
    premiumBadge  : '📘 Premium',
    premiumPrice  : '$199',
    premiumNote   : '한국어 출시 예정',
    premiumBreakdown : '$60 (가입 시 계약금) + $139 (책 인쇄 신청 시) = 6개월 + 책 1권',
    premiumPerks  : [
      'AI Emma 와 대화로 글 만들기 (일 60분 / 월 30시간)',
      '자서전 + 이야기책 작성 (시간 한도 내)',
      '자서전 또는 이야기책 1권 (인쇄)',
      '이야기 100개',
      '사진 50장',
      'PDF 다운로드',
      '가족 음성 QR 코드',
      '가족 공유',
      '영구 데이터 보존',
      '책 우편배송',
    ],
    premiumCta    : 'Coming Soon',
    premiumNote2  : '한국어 출시 예정',

    // Special card — 사진책 만들기 (Sprint 2V 결정 4: 별도 slot)
    specialBadge  : '📷 사진책 만들기',
    specialPrice  : 'Coming Soon',
    specialPerks  : [
      '자서전 / 이야기책과 별도',
      '가족 사진 + 캡션',
      '페이지 별 가격',
      '20p ~ 100p+',
    ],
    specialCta    : 'Coming Soon',

    // Other languages
    langTitle     : '🌍 다른 언어',
    langKo        : '🇰🇷 한국어: $199 (출시 예정)',
    langEn        : '🇺🇸 영어: Coming Soon (베타 진행 중)',
    langEs        : '🇪🇸 스페인어: Coming Soon (베타 진행 중)',

    // Refund
    refundTitle   : '🛡️ 환불 정책',
    refundSub     : '안심하고 시작하세요',
    refunds       : [
      '가입 후 7일 안: 계약금 $60 100% 환불',
      '책 인쇄 전: 책값 $139 100% 환불',
      '배송 분실/결함: 100% 환불',
      '사망/장애: 가족에게 100% 환불',
    ],

    // Why
    whyTitle      : '🎯 왜 SayAndKeep 인가요?',
    moats: [
      { icon: '✨', title: 'AI 동반자 Emma',
        desc: '매주 질문이 아니라 매일 대화하는 동반자.\n시간이 갈수록 당신의 인생을 더 잘 이해합니다.' },
      { icon: '🎤', title: '음성 우선',
        desc: '타이핑이 힘드신가요? 그냥 말씀하세요.\nEmma 가 듣고 글로 만들어드립니다.' },
      { icon: '🇰🇷', title: '한국어 우선',
        desc: '경쟁자 없는 한국어 자서전 서비스.\n한미 가족에게 특별한 선물.' },
      { icon: '📦', title: 'Tim 직접 검수',
        desc: '75년 역사 Collegiate Grill 운영자\nTim 이 모든 책을 직접 검수합니다.' },
      { icon: '📖', title: '평생 보관',
        desc: '책 인쇄 후에도 데이터 영구 보존.\n가족이 두고두고 음성을 들을 수 있습니다.' },
    ],
  },

  // EN: 베타 = 한국어 우선. /pricing 도 한국어 기반 컨텐츠 표시,
  //   영어 사용자에게는 정보성 안내 + 베타 한국어 진행 중임을 명시.
  EN: {
    backHome      : '← Home',
    title         : '💰 Pricing',
    heroLead      : 'Your parents’ life — as a book',
    heroDesc      : 'SayAndKeep helps seniors turn their stories into a printed book.\nWe’re in Korean-language beta. English coming soon.',
    trialBadge    : '🌱 Trial', trialPrice: 'Free', trialSubtitle: 'Start now',
    trialPerks    : ['10 min/day chat with Emma', '1 memoir / story book / photo book',
                     '5 stories', '3 photos', '30 days data retention'],
    trialCta      : '🌱 Start Free Trial', trialAlready: 'You’re already using it 😊',
    premiumBadge  : '📘 Premium', premiumPrice: '$199', premiumNote: 'Korean — launching soon',
    premiumBreakdown : '$60 signup + $139 at print = 6 months + 1 book',
    premiumPerks  : ['Unlimited Emma chat (60 min/day, 30 h/month)',
                     '3 of each book kind', '100 stories', '50 photos',
                     'PDF download', 'Family voice QR', 'Family sharing',
                     'Permanent data retention',
                     'Tim-reviewed 200-300p Lulu Premium Color hardcover',
                     'Mail shipping'],
    premiumCta    : '📘 Apply for Beta',
    premiumNote2  : 'Recruiting 5 Korean-speaking beta users (6 months free + 1 book free)',
    specialBadge  : '👑 Special', specialPrice: 'Contact',
    specialPerks  : ['Family plan', 'Beta user lifetime lock-in', 'Unlimited usage'],
    specialCta    : 'Contact us',
    langTitle     : '🌍 Other languages',
    langKo        : '🇰🇷 Korean: $199 (launching soon)',
    langEn        : '🇺🇸 English: Coming Soon (beta in progress)',
    langEs        : '🇪🇸 Spanish: Coming Soon (beta in progress)',
    refundTitle   : '🛡️ Refund Policy', refundSub: 'Start with peace of mind',
    refunds       : ['Within 7 days of signup: $60 deposit refunded 100%',
                     'Before print: $139 book fee refunded 100%',
                     'Shipping loss/defect: 100% refund',
                     'Death/disability: 100% refund to family'],
    whyTitle      : '🎯 Why SayAndKeep?',
    moats         : [
      { icon: '✨', title: 'AI companion Emma', desc: 'Daily companion, not weekly questions.\nUnderstands you better over time.' },
      { icon: '🎤', title: 'Voice-first',       desc: 'Hard to type? Just speak.\nEmma listens and writes it down.' },
      { icon: '🇰🇷', title: 'Korean-first',      desc: 'Unmatched Korean memoir service.\nA special gift for Korean-American families.' },
      { icon: '📦', title: 'Tim reviews',       desc: '75-year Collegiate Grill operator Tim\npersonally reviews every book.' },
      { icon: '📖', title: 'Permanent',         desc: 'Data preserved forever after printing.\nFamily can listen to the voice for years.' },
    ],
  },

  ES: {
    backHome      : '← Inicio',
    title         : '💰 Precios',
    heroLead      : 'La vida de tus padres — como un libro',
    heroDesc      : 'SayAndKeep ayuda a mayores a convertir sus historias en un libro impreso.\nEstamos en beta en coreano. Español próximamente.',
    trialBadge    : '🌱 Trial', trialPrice: 'Gratis', trialSubtitle: 'Empieza ahora',
    trialPerks    : ['10 min/día con Emma', '1 memoria / libro de historias / libro de fotos',
                     '5 historias', '3 fotos', '30 días de retención'],
    trialCta      : '🌱 Empezar Trial Gratis', trialAlready: 'Ya estás usándolo 😊',
    premiumBadge  : '📘 Premium', premiumPrice: '$199', premiumNote: 'Coreano — próximamente',
    premiumBreakdown : '$60 al registrarte + $139 al imprimir = 6 meses + 1 libro',
    premiumPerks  : ['Chat ilimitado con Emma (60 min/día, 30 h/mes)',
                     '3 de cada tipo de libro', '100 historias', '50 fotos',
                     'Descarga PDF', 'QR de voz para la familia', 'Compartir con la familia',
                     'Retención permanente',
                     'Libro 200-300p hardcover Lulu revisado por Tim',
                     'Envío postal'],
    premiumCta    : '📘 Solicitar Beta',
    premiumNote2  : 'Reclutando 5 usuarios beta hispanohablantes (6 meses gratis + 1 libro gratis)',
    specialBadge  : '👑 Especial', specialPrice: 'Contacto',
    specialPerks  : ['Plan familiar', 'Lock-in vitalicio para beta', 'Uso ilimitado'],
    specialCta    : 'Contáctanos',
    langTitle     : '🌍 Otros idiomas',
    langKo        : '🇰🇷 Coreano: $199 (próximamente)',
    langEn        : '🇺🇸 Inglés: Coming Soon (beta en progreso)',
    langEs        : '🇪🇸 Español: Coming Soon (beta en progreso)',
    refundTitle   : '🛡️ Política de reembolso', refundSub: 'Empieza con tranquilidad',
    refunds       : ['7 días tras registrarte: 100% reembolso del depósito de $60',
                     'Antes de imprimir: 100% reembolso de los $139 del libro',
                     'Pérdida/defecto en envío: 100% reembolso',
                     'Fallecimiento/discapacidad: 100% reembolso a la familia'],
    whyTitle      : '🎯 ¿Por qué SayAndKeep?',
    moats         : [
      { icon: '✨', title: 'IA compañera Emma',  desc: 'Compañera diaria, no preguntas semanales.\nTe entiende mejor con el tiempo.' },
      { icon: '🎤', title: 'Voz primero',         desc: '¿Difícil escribir? Solo habla.\nEmma escucha y lo escribe.' },
      { icon: '🇰🇷', title: 'Coreano primero',     desc: 'Servicio de memorias coreano sin competencia.\nUn regalo especial para familias coreano-americanas.' },
      { icon: '📦', title: 'Revisión de Tim',     desc: 'Tim, operador de Collegiate Grill de 75 años,\nrevisa personalmente cada libro.' },
      { icon: '📖', title: 'Permanente',          desc: 'Los datos se conservan para siempre.\nLa familia puede escuchar la voz durante años.' },
    ],
  },
};

export default function PricingPage() {
  const router = useRouter();
  const lang = useLang();
  const M = PRICING_MSGS[lang] || PRICING_MSGS.KO;
  const { loading: planLoading, plan } = useUserPlan();

  // 🔥 Sprint 2X (2026-05-13) — Stripe Checkout 활성화 (한국어 only).
  //   "Coming Soon" disabled → Stripe Checkout Session 생성 + redirect.
  //   EN/ES 는 Sprint 2V 의 mailto 그대로 (handleBetaApply / handleContact).
  //   Anonymous 사용자는 login redirect (postLoginRedirect 로 /pricing 복귀).
  //
  // 🔥 Sprint 2Y' (2026-05-13) — Tim production bug fix:
  //   localStorage 에 token 있으면 즉시 "로그인 상태" 구분 (🏳️‍⚧).
  //   useUserPlan 의 loading 중 이전에 user 타이프 보끌 활용.
  //   loading=true 일 때는 버튼 상태 disable (사용자 클릭 시 anonymous 처리 X).
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHasToken(!!localStorage.getItem('token'));
  }, []);
  // "로그인됨" = token 있고 plan loaded (plan 이 있거나 loading 중).
  //   token 이 없으면 anonymous (login redirect).
  //   token 이 있면 plan loading 완료까지 대기 (button disabled).
  const isLoggedIn = hasToken;

  async function handlePremiumCheckout() {
    // Anonymous (no token) → /login (postLoginRedirect 로 /pricing 복귀).
    if (!isLoggedIn) {
      try { sessionStorage.setItem('postLoginRedirect', '/pricing'); } catch {}
      router.push('/login');
      return;
    }
    // plan 이 아직 load 안 됐으면 대기 (버튼 disabled 로 이미 막는다면 이 곣 도달 X).
    if (planLoading) {
      return;
    }
    // 이미 premium / unlimited 회원 안내
    if (plan?.isPaid) {
      alert('이미 Premium 회원이세요. 자서전 만들기를 시작해 보세요 😊');
      router.push('/my-stories');
      return;
    }
    setCheckoutLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/checkout/premium', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || '결제 시스템 오류. 잠시 후 다시 시도해 주세요.');
        setCheckoutLoading(false);
        return;
      }
      if (data.url) {
        // Stripe Checkout 으로 redirect — 이 페이지 떠남.
        window.location.href = data.url;
        return;
      }
      // Defensive — url 누락 (이론상 발생 X)
      alert('결제 페이지를 열 수 없어요. 잠시 후 다시 시도해 주세요.');
      setCheckoutLoading(false);
    } catch (err) {
      console.error('[handlePremiumCheckout]', err?.message || err);
      alert('결제 시스템 오류. 잠시 후 다시 시도해 주세요.');
      setCheckoutLoading(false);
    }
  }

  // CTA handlers — Sprint 2k 결정 1-A, 2-A+C, 3-A, 4-A.
  function handleTrialStart() {
    if (plan?.isPaid) {
      alert(M.trialAlready);
      return;
    }
    if (plan?.isTrial) {
      router.push('/architect');
      return;
    }
    // Anonymous → register tab on login page.
    router.push('/login?mode=register');
  }

  function handleBetaApply() {
    // Sprint 2k Tim 결정 4-A: 베타 5명 = Tim 의 admin 수동 처리.
    //   Stripe / invite code = Phase 5+. 지금은 mailto 가 충분.
    const subject = encodeURIComponent('SayAndKeep 베타 신청');
    window.location.href = `mailto:systeco@hotmail.com?subject=${subject}`;
  }

  function handleContact() {
    const subject = encodeURIComponent('SayAndKeep 문의');
    window.location.href = `mailto:systeco@hotmail.com?subject=${subject}`;
  }

  return (
    <div className={s.page}>
      {/* Sprint 2f 의 2-row 헤더 표준 */}
      <header className={s.header}>
        <div className={s.headerRow1}>
          <button className={s.backBtn} onClick={() => router.push('/')}>
            {M.backHome}
          </button>
        </div>
        <h1 className={s.title}>{M.title}</h1>
      </header>

      <main className={s.main}>
        {/* Hero */}
        <section className={s.hero}>
          <h2 className={s.heroLead}>{M.heroLead}</h2>
          <p className={s.heroDesc}>{M.heroDesc}</p>
        </section>

        {/* 3 Tier 카드 */}
        <section className={s.tiers}>
          {/* 🌱 Trial — 녹색 */}
          <article className={`${s.tierCard} ${s.trialCard}`}>
            <div className={s.tierBadge}>{M.trialBadge}</div>
            <div className={s.tierPrice}>{M.trialPrice}</div>
            <div className={s.tierSubtitle}>{M.trialSubtitle}</div>
            <ul className={s.tierPerks}>
              {M.trialPerks.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <button className={s.trialBtn} onClick={handleTrialStart}>
              {plan?.isTrial ? '계속하기 →' : M.trialCta}
            </button>
          </article>

          {/* 📘 Premium — 오렌지 (brand) */}
          <article className={`${s.tierCard} ${s.premiumCard}`}>
            <div className={s.tierBadge}>{M.premiumBadge}</div>
            <div className={s.tierPrice}>{M.premiumPrice}</div>
            <div className={s.tierSubtitle}>{M.premiumNote}</div>
            <div className={s.premiumBreakdown}>{M.premiumBreakdown}</div>
            <ul className={s.tierPerks}>
              {M.premiumPerks.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            {/* 🔥 Sprint 2X (2026-05-13) — Premium CTA Stripe Checkout 활성화
                (한국어 only). Sprint 2V 의 disabled → handlePremiumCheckout.
                - Anonymous: /login redirect (postLoginRedirect=/pricing)
                - Trial: Stripe Checkout Session → redirect
                - 이미 premium: alert + /my-stories
                EN/ES 는 Sprint 2V 의 mailto 그대로 (handleBetaApply 보존). */}
            <button
              className={s.premiumBtn}
              onClick={lang === 'KO' ? handlePremiumCheckout : handleBetaApply}
              disabled={lang === 'KO' && (checkoutLoading || (isLoggedIn && planLoading))}
            >
              {lang === 'KO'
                ? (checkoutLoading
                    ? '잠시만요…'
                    : !isLoggedIn
                      ? '로그인 후 가입하기'
                      : (planLoading ? '잘시만요…' : '📘 Premium 가입하기'))
                : M.premiumCta}
            </button>
            <div className={s.premiumNote2}>{M.premiumNote2}</div>
          </article>

          {/* 📷 사진책 만들기 — Coming Soon (Sprint 2V 결정 4: 별도 slot) */}
          <article className={`${s.tierCard} ${s.specialCard}`}>
            <div className={s.tierBadge}>{M.specialBadge}</div>
            <div className={s.tierPrice}>{M.specialPrice}</div>
            <ul className={s.tierPerks}>
              {M.specialPerks.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            {/* 🔥 Sprint 2V — Special slot 도 한국어 "Coming Soon" 비활성. */}
            <button
              className={`${s.specialBtn} ${lang === 'KO' ? s.ctaDisabled : ''}`}
              onClick={lang === 'KO' ? undefined : handleContact}
              disabled={lang === 'KO'}
              aria-disabled={lang === 'KO' ? 'true' : undefined}
            >
              {M.specialCta}
            </button>
          </article>
        </section>

        {/* Other languages */}
        <section className={s.langSection}>
          <h3 className={s.sectionTitle}>{M.langTitle}</h3>
          <ul className={s.langList}>
            <li>{M.langKo}</li>
            <li>{M.langEn}</li>
            <li>{M.langEs}</li>
          </ul>
        </section>

        {/* 환불 정책 */}
        <section className={s.refundSection}>
          <h3 className={s.sectionTitle}>{M.refundTitle}</h3>
          <p className={s.refundSub}>{M.refundSub}</p>
          <ul className={s.refundList}>
            {M.refunds.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </section>

        {/* Why SayAndKeep — 5 Moats */}
        <section className={s.whySection}>
          <h3 className={s.sectionTitle}>{M.whyTitle}</h3>
          <div className={s.moatsGrid}>
            {M.moats.map((m, i) => (
              <div key={i} className={s.moatCard}>
                <div className={s.moatIcon}>{m.icon}</div>
                <div className={s.moatTitle}>{m.title}</div>
                <p className={s.moatDesc}>{m.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
