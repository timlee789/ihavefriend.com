'use client';

/**
 * /story/select — branch the user's intent before /chat.
 *
 * Triggered from the home page's "내 이야기 남기기" button. We don't
 * want to silently route to /chat?mode=story anymore — the user can
 * also choose to start a templated book here. Two big senior-friendly
 * buttons, one per intent.
 */

import { useRouter } from 'next/navigation';
import s from './page.module.css';

export default function StorySelectPage() {
  const router = useRouter();

  return (
    <div className={s.container}>
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push('/')}>← 홈</button>
      </header>

      <h1 className={s.title}>오늘은 어떻게 시작하시겠어요?</h1>

      <button className={s.optionCard} onClick={() => router.push('/chat?mode=story')}>
        <div className={s.optionIcon}>🎙️</div>
        <div className={s.optionInfo}>
          <div className={s.optionTitle}>자유롭게 이야기하기</div>
          <div className={s.optionDesc}>
            떠오르는 대로 편하게 이야기 나눠요.<br />
            Emma가 듣고 기록해드려요.
          </div>
        </div>
      </button>

      <button
        className={`${s.optionCard} ${s.optionCardPurple}`}
        onClick={() => router.push('/book/select')}
      >
        <div className={s.optionIcon}>📚</div>
        <div className={s.optionInfo}>
          <div className={s.optionTitle}>책 만들기</div>
          <div className={s.optionDesc}>
            내 이야기를 책으로 정리해요.<br />
            (자서전, 회고록 등)
          </div>
        </div>
      </button>
    </div>
  );
}
