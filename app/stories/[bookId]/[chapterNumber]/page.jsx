/**
 * /stories/[bookId]/[chapterNumber] — Level 3: Chapter body.
 *
 * Reading view tuned for senior users:
 *   - 20px body, line-height 1.9, max-width 700px
 *   - 44px+ tap targets on prev/next/toc nav
 *   - signature shown after the final chapter only
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBooksIndex, getBookById, getChapter } from '@/lib/storiesData';
import s from './page.module.css';

export function generateStaticParams() {
  const params = [];
  for (const meta of getBooksIndex()) {
    const book = getBookById(meta.id);
    if (!book) continue;
    for (const ch of book.chapters || []) {
      params.push({ bookId: meta.id, chapterNumber: String(ch.number) });
    }
  }
  return params;
}

export async function generateMetadata({ params }) {
  const { bookId, chapterNumber } = await params;
  const { book, chapter } = getChapter(bookId, chapterNumber);
  if (!book || !chapter) return { title: 'SayAndKeep' };
  return {
    title: `${chapter.fullTitle} — ${book.title} | SayAndKeep`,
    description: `${book.authorLabel} 「${book.title}」 ${chapter.fullTitle}`,
  };
}

export default async function ChapterPage({ params }) {
  const { bookId, chapterNumber } = await params;
  const { book, chapter } = getChapter(bookId, chapterNumber);
  if (!book || !chapter) notFound();

  const total = book.totalChapters || book.chapters.length;
  const current = chapter.number;
  const isFirst = current <= 1;
  const isLast  = current >= total;

  return (
    <div className={s.page}>
      <header className={s.topNav}>
        <Link href={`/stories/${book.id}`} className={s.backLink}>
          ‹ 목차
        </Link>
        <div className={s.bookCrumb}>
          <span className={s.crumbAuthor}>{book.authorLabel}</span>
          <span className={s.crumbDot}>·</span>
          <span className={s.crumbBook}>{book.title}</span>
        </div>
      </header>

      <article className={s.article}>
        <h1 className={s.chapterTitle}>{chapter.fullTitle}</h1>

        <div className={s.body}>
          {chapter.paragraphs.map((para, i) => (
            <p key={i} className={s.paragraph}>{para}</p>
          ))}
        </div>

        {isLast && book.signature && (
          <div className={s.signature}>{book.signature}</div>
        )}
      </article>

      <nav className={s.bottomNav} aria-label="챕터 이동">
        {isFirst ? (
          <span className={`${s.navBtn} ${s.navDisabled}`} aria-disabled="true">
            ← 이전
          </span>
        ) : (
          <Link
            href={`/stories/${book.id}/${current - 1}`}
            className={s.navBtn}
            aria-label="이전 장"
          >
            ← 이전
          </Link>
        )}

        <Link
          href={`/stories/${book.id}`}
          className={`${s.navBtn} ${s.navToc}`}
          aria-label="목차로 돌아가기"
        >
          목차로
        </Link>

        {isLast ? (
          <span className={`${s.navBtn} ${s.navDisabled}`} aria-disabled="true">
            다음 →
          </span>
        ) : (
          <Link
            href={`/stories/${book.id}/${current + 1}`}
            className={s.navBtn}
            aria-label="다음 장"
          >
            다음 →
          </Link>
        )}
      </nav>
    </div>
  );
}
