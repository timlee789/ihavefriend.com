'use client';

/**
 * /terms — Terms of Service page (Task 87).
 *
 * Public page (no auth required). Linked from home page footer
 * (and eventually signup/login flows). Three languages: KO / EN / ES.
 *
 * Tim's decisions (2026-05-02):
 * - Pricing: $99 Digital / $199 Print 2 books / +$69 per extra
 * - Page limit: 300 pages (Print plan)
 * - Recording limit: 10 min per fragment
 * - Storage: "Permanent digital archive" (NEVER "lifetime")
 * - Beta users: free Digital + grandfather for voice QR
 * - Refund: 30 days, before printing
 * - Service shutdown: 90-day notice + bulk download
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './page.module.css';

const TERMS_MSGS = {
  KO: {
    pageTitle: '서비스 약관',
    backHome: '← 홈으로',
    lastUpdated: '최종 업데이트: 2026년 5월 2일',

    section1: '1. 서비스 개요',
    section2: '2. 가격 및 결제',
    section3: '3. 페이지 및 녹음 한도',
    section4: '4. 데이터 보관 정책',
    section5: '5. 환불 정책',
    section6: '6. 베타 사용자 혜택',
    section7: '7. 서비스 중단 시',
    section8: '8. 사용자 책임',
    section9: '9. 개인정보 보호',
    section10: '10. 연락처',

    s1_p1: 'SayAndKeep ("당사", "서비스")는 AI 기술을 활용하여 사용자의 음성 이야기를 책으로 만들어주는 서비스입니다.',
    s1_p2: '본 약관은 SayAndKeep의 모든 사용자에게 적용됩니다. 서비스를 이용함으로써 본 약관에 동의하는 것으로 간주됩니다.',

    s2_p1: 'SayAndKeep는 1회 결제 모델을 사용하며, 구독 결제는 없습니다.',
    s2_plan1: '🌱 Digital ($99): ebook PDF + 음성 영구 디지털 아카이브 + QR 가족 공유',
    s2_plan2: '📖 Print ($199): Digital 모든 기능 + 양장 인쇄본 2권 (Lulu 최소 2권 제약)',
    s2_plan3: '📚 추가 책 ($69/권): 동일 콘텐츠 추가 인쇄',
    s2_p2: '모든 가격은 USD 기준이며, 한국 사용자에게는 자동 환산되어 표시됩니다.',

    s3_digital: 'Digital 플랜:',
    s3_d1: '- 페이지: 무제한 (디지털 PDF)',
    s3_d2: '- 음성 보관: 무제한',
    s3_d3: '- 글자수: 무제한',
    s3_print: 'Print 플랜:',
    s3_p1: '- 페이지 한도: 300페이지 (양장본 6x9 inches)',
    s3_p2: '- 사진: 페이지당 최대 2장',
    s3_p3: '- 300-480페이지 구간: 페이지당 $0.50 추가',
    s3_p4: '- 480페이지 초과: 별도 권 분리 ($69/권)',
    s3_recording: '녹음 한도:',
    s3_r1: '- fragment(질문 답변)당: 최대 10분',
    s3_r2: '- 녹음 횟수: 무제한',

    s4_intro: 'SayAndKeep는 사용자의 데이터를 안전하게 보관할 책임을 집니다.',
    s4_h1: '운영 기간 동안의 보관:',
    s4_p1: 'SayAndKeep는 회사가 운영되는 동안 귀하의 음성 녹음, PDF, 메타데이터를 안전하게 보관합니다. 업계 표준 클라우드 인프라 (Vercel Blob, 99.99% 가동률)를 사용합니다.',
    s4_h2: '다운로드 권리:',
    s4_p2: '귀하는 언제든 무료로 모든 콘텐츠를 다운로드할 수 있습니다:',
    s4_d1: '- 음성 파일 (.webm 형식)',
    s4_d2: '- PDF 책 (고해상도 인쇄 준비)',
    s4_d3: '- 텍스트 전사 (Markdown 형식)',
    s4_d4: '- 사진 (원본 해상도)',
    s4_h3: '⚠️ 중요 — 사용자 백업 권장:',
    s4_p3: '본인 디바이스나 가족 클라우드 (Google Drive, iCloud, Dropbox)에 정기적으로 (예: 매년 1회) 다운로드 백업하실 것을 강력히 권장합니다.',
    s4_p4: '"영구 디지털 아카이브"는 SayAndKeep 운영 기간 동안의 보관을 의미하며, 회사의 영구 존재를 보장하지 않습니다.',

    s5_p1: '30일 환불 보장:',
    s5_p2: '결제 후 30일 이내, 인쇄본이 인쇄소로 전송되기 전에는 100% 환불이 가능합니다.',
    s5_p3: '환불 불가:',
    s5_n1: '- 인쇄본이 인쇄소로 전송된 후',
    s5_n2: '- 결제 후 30일이 지난 경우',
    s5_n3: '- 디지털 콘텐츠를 이미 다운로드한 후',
    s5_p4: '환불 신청은 systeco@hotmail.com 으로 이메일 주시면 영업일 기준 3일 이내 처리됩니다.',

    s6_intro: '베타 사용자 (Tim 가족 + 초대받은 50명) 혜택:',
    s6_b1: '✅ Digital 영구 무료 (감사 표시)',
    s6_b2: '✅ 음성 QR 출시 시 자동 무료 적용 (grandfather)',
    s6_b3: '✅ Print 50% 할인 (첫 주문에 한해 $99)',
    s6_b4: '✅ 모든 데이터 언제든 무료 다운로드',
    s6_b5: '✅ 30일 환불 보장',
    s6_p1: '베타 혜택은 영구적이며, 향후 가격 인상 시에도 grandfather 적용됩니다.',

    s7_intro: '서비스 중단 시 (불행한 경우):',
    s7_p1: '회사 폐업이나 서비스 종료가 결정될 경우, 다음을 약속드립니다:',
    s7_g1: '✅ 90일 사전 이메일 통지',
    s7_g2: '✅ 모든 콘텐츠 무료 일괄 다운로드 제공',
    s7_g3: '✅ 마이그레이션 지원 (표준 형식 변환)',
    s7_g4: '✅ 다른 서비스 이전 도움',
    s7_p2: '이는 사용자가 데이터를 잃을 위험을 최소화하기 위한 약속입니다.',

    s8_intro: '사용자는 다음에 동의합니다:',
    s8_u1: '- 본인이 작성한 콘텐츠의 진실성과 합법성',
    s8_u2: '- 타인의 저작권/초상권 침해 콘텐츠 미사용',
    s8_u3: '- 본인 계정 정보(이메일, 비밀번호) 보안 관리',
    s8_u4: '- 정기적인 데이터 백업 (권장)',
    s8_u5: '- 서비스 약관 변경 시 이메일 통지를 수신',

    s9_p1: 'SayAndKeep는 사용자의 개인정보를 보호합니다:',
    s9_pp1: '- 음성/텍스트 콘텐츠는 사용자 본인만 접근 가능 (QR 활성화 시 가족 공유)',
    s9_pp2: '- 마케팅 목적으로 콘텐츠를 사용하지 않음',
    s9_pp3: '- 제3자에게 데이터 판매 안 함',
    s9_pp4: '- 인증 시 이메일/비밀번호만 수집',
    s9_pp5: '- AI 처리 (OpenAI Whisper, Google Gemini)는 일시적이며 학습에 사용되지 않음',

    s10_intro: '문의사항이나 지원 요청:',
    s10_email: 'systeco@hotmail.com',
    s10_response: '영업일 기준 1-3일 이내 답변',
  },

  EN: {
    pageTitle: 'Terms of Service',
    backHome: '← Home',
    lastUpdated: 'Last updated: May 2, 2026',

    section1: '1. Service Overview',
    section2: '2. Pricing and Payment',
    section3: '3. Page and Recording Limits',
    section4: '4. Data Preservation Policy',
    section5: '5. Refund Policy',
    section6: '6. Beta User Benefits',
    section7: '7. Service Discontinuation',
    section8: '8. User Responsibilities',
    section9: '9. Privacy',
    section10: '10. Contact',

    s1_p1: 'SayAndKeep ("we", "the service") is a service that uses AI technology to transform your spoken stories into books.',
    s1_p2: 'These terms apply to all SayAndKeep users. By using the service, you agree to these terms.',

    s2_p1: 'SayAndKeep uses a one-time payment model with no subscription.',
    s2_plan1: '🌱 Digital ($99): ebook PDF + permanent voice archive + QR family sharing',
    s2_plan2: '📖 Print ($199): All Digital features + 2 hardcover books (Lulu minimum)',
    s2_plan3: '📚 Additional books ($69/copy): Same content, extra prints',
    s2_p2: 'All prices in USD. Korean users see automatic conversion to KRW.',

    s3_digital: 'Digital Plan:',
    s3_d1: '- Pages: Unlimited (digital PDF)',
    s3_d2: '- Voice storage: Unlimited',
    s3_d3: '- Word count: Unlimited',
    s3_print: 'Print Plan:',
    s3_p1: '- Page limit: 300 pages (6x9 hardcover)',
    s3_p2: '- Photos: Up to 2 per page',
    s3_p3: '- 300-480 pages: $0.50 per additional page',
    s3_p4: '- Over 480 pages: Split into separate volumes ($69/volume)',
    s3_recording: 'Recording Limits:',
    s3_r1: '- Per fragment (question answer): Up to 10 minutes',
    s3_r2: '- Number of recordings: Unlimited',

    s4_intro: 'SayAndKeep takes responsibility for safely preserving your data.',
    s4_h1: 'Active Operation Period:',
    s4_p1: 'SayAndKeep commits to storing your audio recordings, PDFs, and metadata for the duration of our active operation. We use industry-standard cloud storage (Vercel Blob) with 99.99% uptime.',
    s4_h2: 'Download Rights:',
    s4_p2: 'You can download all your content at any time, free of charge:',
    s4_d1: '- Audio files (.webm format)',
    s4_d2: '- PDF books (high-resolution print-ready)',
    s4_d3: '- Text transcripts (Markdown format)',
    s4_d4: '- Photos (original resolution)',
    s4_h3: '⚠️ Important — Recommended User Backup:',
    s4_p3: 'We strongly encourage users to download their content periodically (e.g., annually) to their own devices or cloud storage (Google Drive, iCloud, Dropbox).',
    s4_p4: '"Permanent digital archive" refers to storage during SayAndKeep\'s active operation; we cannot guarantee perpetual company existence.',

    s5_p1: '30-Day Money-Back Guarantee:',
    s5_p2: 'Within 30 days of purchase, before printed books are sent to the printer, you can request a 100% refund.',
    s5_p3: 'Non-Refundable:',
    s5_n1: '- After printed books have been sent to the printer',
    s5_n2: '- After 30 days from purchase',
    s5_n3: '- After digital content has been downloaded',
    s5_p4: 'Refund requests: email systeco@hotmail.com (processed within 3 business days).',

    s6_intro: 'Beta User (Tim\'s family + 50 invited members) Benefits:',
    s6_b1: '✅ Digital free forever (as our thanks)',
    s6_b2: '✅ Voice QR free upon launch (grandfather pricing)',
    s6_b3: '✅ Print 50% off (first order, $99 instead of $199)',
    s6_b4: '✅ Free data download anytime',
    s6_b5: '✅ 30-day money-back guarantee',
    s6_p1: 'Beta benefits are permanent and grandfather through future price increases.',

    s7_intro: 'In the unlikely event of service discontinuation:',
    s7_p1: 'If we ever decide to close the service, we commit to:',
    s7_g1: '✅ 90 days advance notice via email',
    s7_g2: '✅ Free bulk download of all your content',
    s7_g3: '✅ Migration assistance (export to standard formats)',
    s7_g4: '✅ Help transitioning to alternative services',
    s7_p2: 'This commitment minimizes the risk of data loss for users.',

    s8_intro: 'Users agree to:',
    s8_u1: '- Provide truthful and lawful content',
    s8_u2: '- Not infringe on copyright or likeness rights of others',
    s8_u3: '- Maintain account security (email, password)',
    s8_u4: '- Periodic data backup (recommended)',
    s8_u5: '- Receive email notifications of terms changes',

    s9_p1: 'SayAndKeep protects user privacy:',
    s9_pp1: '- Voice/text content is accessible only to the user (or family if QR is enabled)',
    s9_pp2: '- We do not use your content for marketing',
    s9_pp3: '- We do not sell user data to third parties',
    s9_pp4: '- We collect only email and password for authentication',
    s9_pp5: '- AI processing (OpenAI Whisper, Google Gemini) is transient and not used for training',

    s10_intro: 'For questions or support:',
    s10_email: 'systeco@hotmail.com',
    s10_response: 'Response within 1-3 business days',
  },

  ES: {
    pageTitle: 'Términos del Servicio',
    backHome: '← Inicio',
    lastUpdated: 'Última actualización: 2 de mayo de 2026',

    section1: '1. Descripción del servicio',
    section2: '2. Precios y pago',
    section3: '3. Límites de páginas y grabación',
    section4: '4. Política de preservación de datos',
    section5: '5. Política de reembolso',
    section6: '6. Beneficios para usuarios beta',
    section7: '7. Discontinuación del servicio',
    section8: '8. Responsabilidades del usuario',
    section9: '9. Privacidad',
    section10: '10. Contacto',

    s1_p1: 'SayAndKeep ("nosotros", "el servicio") es un servicio que usa tecnología de IA para transformar tus historias habladas en libros.',
    s1_p2: 'Estos términos se aplican a todos los usuarios. Al usar el servicio, aceptas estos términos.',

    s2_p1: 'SayAndKeep usa un modelo de pago único, sin suscripción.',
    s2_plan1: '🌱 Digital ($99): PDF e-book + archivo de voz permanente + QR para compartir con la familia',
    s2_plan2: '📖 Print ($199): Todas las funciones de Digital + 2 libros tapa dura (mínimo Lulu)',
    s2_plan3: '📚 Libros adicionales ($69/copia): Mismo contenido, copias extras',
    s2_p2: 'Todos los precios en USD.',

    s3_digital: 'Plan Digital:',
    s3_d1: '- Páginas: Ilimitadas (PDF digital)',
    s3_d2: '- Almacenamiento de voz: Ilimitado',
    s3_d3: '- Cantidad de palabras: Ilimitada',
    s3_print: 'Plan Print:',
    s3_p1: '- Límite de páginas: 300 páginas (tapa dura 6x9)',
    s3_p2: '- Fotos: Hasta 2 por página',
    s3_p3: '- 300-480 páginas: $0.50 por página adicional',
    s3_p4: '- Más de 480 páginas: Dividido en volúmenes separados ($69/volumen)',
    s3_recording: 'Límites de grabación:',
    s3_r1: '- Por fragmento: Hasta 10 minutos',
    s3_r2: '- Número de grabaciones: Ilimitado',

    s4_intro: 'SayAndKeep se responsabiliza de preservar tus datos de forma segura.',
    s4_h1: 'Período de operación activa:',
    s4_p1: 'SayAndKeep se compromete a almacenar tus grabaciones, PDFs y metadatos durante nuestra operación activa. Usamos almacenamiento en la nube estándar (Vercel Blob) con 99.99% de tiempo activo.',
    s4_h2: 'Derechos de descarga:',
    s4_p2: 'Puedes descargar todo tu contenido en cualquier momento, gratis:',
    s4_d1: '- Archivos de audio (formato .webm)',
    s4_d2: '- Libros PDF (alta resolución listos para imprimir)',
    s4_d3: '- Transcripciones de texto (formato Markdown)',
    s4_d4: '- Fotos (resolución original)',
    s4_h3: '⚠️ Importante — Copia de seguridad recomendada:',
    s4_p3: 'Recomendamos descargar tu contenido periódicamente (ej. anualmente) a tus dispositivos o nube familiar (Google Drive, iCloud, Dropbox).',
    s4_p4: '"Archivo digital permanente" se refiere al almacenamiento durante la operación activa de SayAndKeep; no garantizamos la existencia perpetua de la empresa.',

    s5_p1: 'Garantía de devolución de 30 días:',
    s5_p2: 'Dentro de los 30 días de la compra, antes de enviar libros impresos a la imprenta, puedes solicitar un reembolso del 100%.',
    s5_p3: 'No reembolsable:',
    s5_n1: '- Después de enviar libros impresos a la imprenta',
    s5_n2: '- Después de 30 días desde la compra',
    s5_n3: '- Después de descargar contenido digital',
    s5_p4: 'Solicitudes de reembolso: systeco@hotmail.com (procesadas en 3 días laborales).',

    s6_intro: 'Beneficios para usuarios beta:',
    s6_b1: '✅ Digital gratis para siempre (como agradecimiento)',
    s6_b2: '✅ Voice QR gratis al lanzamiento (precio grandfather)',
    s6_b3: '✅ Print 50% descuento (primer pedido)',
    s6_b4: '✅ Descarga de datos gratis en cualquier momento',
    s6_b5: '✅ Garantía de devolución de 30 días',
    s6_p1: 'Beneficios beta son permanentes y aplican incluso con futuros aumentos de precio.',

    s7_intro: 'En el caso improbable de discontinuación del servicio:',
    s7_p1: 'Si decidimos cerrar el servicio, nos comprometemos a:',
    s7_g1: '✅ Aviso por email con 90 días de anticipación',
    s7_g2: '✅ Descarga masiva gratuita de todo tu contenido',
    s7_g3: '✅ Asistencia para migración (exportación a formatos estándar)',
    s7_g4: '✅ Ayuda para transicionar a servicios alternativos',
    s7_p2: 'Este compromiso minimiza el riesgo de pérdida de datos.',

    s8_intro: 'Los usuarios aceptan:',
    s8_u1: '- Proporcionar contenido veraz y lícito',
    s8_u2: '- No infringir derechos de autor o de imagen de otros',
    s8_u3: '- Mantener la seguridad de la cuenta',
    s8_u4: '- Copia de seguridad periódica (recomendado)',
    s8_u5: '- Recibir notificaciones de cambios en los términos',

    s9_p1: 'SayAndKeep protege la privacidad del usuario:',
    s9_pp1: '- El contenido de voz/texto es accesible solo para el usuario (o familia si QR está activado)',
    s9_pp2: '- No usamos tu contenido para marketing',
    s9_pp3: '- No vendemos datos de usuarios a terceros',
    s9_pp4: '- Solo recolectamos email y contraseña para autenticación',
    s9_pp5: '- El procesamiento de IA (OpenAI Whisper, Google Gemini) es transitorio y no se usa para entrenamiento',

    s10_intro: 'Para preguntas o soporte:',
    s10_email: 'systeco@hotmail.com',
    s10_response: 'Respuesta en 1-3 días laborales',
  },
};

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

export default function TermsOfService() {
  const router = useRouter();
  const lang = useLang();
  const m = TERMS_MSGS[lang] || TERMS_MSGS.KO;

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/')}>
          {m.backHome}
        </button>
      </header>

      <main className={s.content}>
        <h1 className={s.title}>{m.pageTitle}</h1>
        <div className={s.lastUpdated}>{m.lastUpdated}</div>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section1}</h2>
          <p>{m.s1_p1}</p>
          <p>{m.s1_p2}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section2}</h2>
          <p>{m.s2_p1}</p>
          <ul className={s.planList}>
            <li>{m.s2_plan1}</li>
            <li>{m.s2_plan2}</li>
            <li>{m.s2_plan3}</li>
          </ul>
          <p>{m.s2_p2}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section3}</h2>
          <h3 className={s.subTitle}>{m.s3_digital}</h3>
          <ul>
            <li>{m.s3_d1}</li>
            <li>{m.s3_d2}</li>
            <li>{m.s3_d3}</li>
          </ul>
          <h3 className={s.subTitle}>{m.s3_print}</h3>
          <ul>
            <li>{m.s3_p1}</li>
            <li>{m.s3_p2}</li>
            <li>{m.s3_p3}</li>
            <li>{m.s3_p4}</li>
          </ul>
          <h3 className={s.subTitle}>{m.s3_recording}</h3>
          <ul>
            <li>{m.s3_r1}</li>
            <li>{m.s3_r2}</li>
          </ul>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section4}</h2>
          <p>{m.s4_intro}</p>
          <h3 className={s.subTitle}>{m.s4_h1}</h3>
          <p>{m.s4_p1}</p>
          <h3 className={s.subTitle}>{m.s4_h2}</h3>
          <p>{m.s4_p2}</p>
          <ul>
            <li>{m.s4_d1}</li>
            <li>{m.s4_d2}</li>
            <li>{m.s4_d3}</li>
            <li>{m.s4_d4}</li>
          </ul>
          <h3 className={s.subTitle}>{m.s4_h3}</h3>
          <p className={s.warning}>{m.s4_p3}</p>
          <p className={s.disclaimer}>{m.s4_p4}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section5}</h2>
          <h3 className={s.subTitle}>{m.s5_p1}</h3>
          <p>{m.s5_p2}</p>
          <h3 className={s.subTitle}>{m.s5_p3}</h3>
          <ul>
            <li>{m.s5_n1}</li>
            <li>{m.s5_n2}</li>
            <li>{m.s5_n3}</li>
          </ul>
          <p>{m.s5_p4}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section6}</h2>
          <p>{m.s6_intro}</p>
          <ul className={s.benefitList}>
            <li>{m.s6_b1}</li>
            <li>{m.s6_b2}</li>
            <li>{m.s6_b3}</li>
            <li>{m.s6_b4}</li>
            <li>{m.s6_b5}</li>
          </ul>
          <p className={s.highlight}>{m.s6_p1}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section7}</h2>
          <p>{m.s7_intro}</p>
          <p>{m.s7_p1}</p>
          <ul className={s.benefitList}>
            <li>{m.s7_g1}</li>
            <li>{m.s7_g2}</li>
            <li>{m.s7_g3}</li>
            <li>{m.s7_g4}</li>
          </ul>
          <p>{m.s7_p2}</p>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section8}</h2>
          <p>{m.s8_intro}</p>
          <ul>
            <li>{m.s8_u1}</li>
            <li>{m.s8_u2}</li>
            <li>{m.s8_u3}</li>
            <li>{m.s8_u4}</li>
            <li>{m.s8_u5}</li>
          </ul>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section9}</h2>
          <p>{m.s9_p1}</p>
          <ul>
            <li>{m.s9_pp1}</li>
            <li>{m.s9_pp2}</li>
            <li>{m.s9_pp3}</li>
            <li>{m.s9_pp4}</li>
            <li>{m.s9_pp5}</li>
          </ul>
        </section>

        <section className={s.section}>
          <h2 className={s.sectionTitle}>{m.section10}</h2>
          <p>{m.s10_intro}</p>
          <p className={s.email}>
            <a href={`mailto:${m.s10_email}`}>{m.s10_email}</a>
          </p>
          <p className={s.muted}>{m.s10_response}</p>
        </section>
      </main>
    </div>
  );
}
