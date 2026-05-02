/**
 * /stories — Level 1: Book selection.
 *
 * Static page driven by data/stories/index.json. Two cards (memoir + essay)
 * with intentionally distinct tones so the senior reader can sense the
 * voice difference before opening either book.
 */

import Link from 'next/link';
import { getBooksIndex } from '@/lib/storiesData';
import s from './page.module.css';

export const metadata = {
  title: '다른 사람 이야기 보기 — SayAndKeep',
  description: '다른 분들의 자서전과 수필을 미리 읽어 보세요. 김순자 어머님의 일생, 박정민 선생의 사색.',
};

const UNIT_LABEL = { memoir: '장', essay: '편' };

export default function StoriesIndexPage() {
  const books = getBooksIndex();

  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link href="/" className={s.backLink} aria-label="홈으로">‹ 홈</Link>
        <h1 className={s.pageTitle}>다른 사람 이야기 보기</h1>
        <p className={s.subtitle}>
          다른 분들의 이야기를 천천히 읽어 보세요.<br />
          여러분의 이야기도 이렇게 책이 될 수 있습니다.
        </p>
      </header>

      <section className={s.cardList} aria-label="책 목록">
        {books.map(book => {
          const unit = UNIT_LABEL[book.type] || '장';
          const cardClass = `${s.card} ${book.type === 'memoir' ? s.cardMemoir : s.cardEssay}`;
          return (
            <Link
              key={book.id}
              href={`/stories/${book.id}`}
              className={cardClass}
            >
              <div className={s.cardKind}>
                {book.type === 'memoir' ? '자서전' : '수필집'}
              </div>
              <h2 className={s.cardTitle}>{book.title}</h2>
              <div className={s.cardAuthor}>{book.authorLabel}</div>
              <div className={s.cardMeta}>총 {book.totalChapters}{unit}</div>
              <div className={s.cardCta}>읽기 →</div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
