/**
 * /stories/[bookId] — Level 2: Table of contents.
 *
 * Lists every chapter as a tappable row. Static (generateStaticParams)
 * because the bundled JSON files are the only source of books.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBooksIndex, getBookById } from '@/lib/storiesData';
import s from './page.module.css';

export function generateStaticParams() {
  return getBooksIndex().map(b => ({ bookId: b.id }));
}

export async function generateMetadata({ params }) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) return { title: 'SayAndKeep' };
  return {
    title: `${book.title} — ${book.authorLabel} | SayAndKeep`,
    description: `${book.authorLabel}의 ${book.type === 'memoir' ? '자서전' : '수필집'} 「${book.title}」 목차.`,
  };
}

export default async function BookTocPage({ params }) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) notFound();

  const unit = book.chapterUnit || (book.type === 'memoir' ? '장' : '편');

  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link href="/sharing-stories" className={s.backLink}>‹ 책 목록으로</Link>
        <div className={s.kindBadge}>
          {book.type === 'memoir' ? '자서전' : '수필집'}
        </div>
        <h1 className={s.bookTitle}>{book.title}</h1>
        <div className={s.bookAuthor}>{book.authorLabel}</div>
        <div className={s.bookMeta}>총 {book.totalChapters}{unit}</div>
      </header>

      <nav className={s.tocList} aria-label="목차">
        {book.chapters.map(ch => (
          <Link
            key={ch.number}
            href={`/stories/${book.id}/${ch.number}`}
            className={s.tocRow}
          >
            <span className={s.tocNumber}>{ch.number}</span>
            <span className={s.tocTitle}>{ch.title}</span>
            <span className={s.tocArrow} aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
