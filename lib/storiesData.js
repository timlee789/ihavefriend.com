/**
 * Static loader for the "다른 사람 이야기 보기" (/stories) feature.
 *
 * Reads the bundled JSON samples (index + per-book) at build time so the
 * pages can stay as server components with no runtime fetch.
 */

import indexData  from '@/data/stories/index.json';
import memoirData from '@/data/stories/memoir.json';
import essayData  from '@/data/stories/essay.json';

const BOOKS_BY_FILE = {
  'memoir.json': memoirData,
  'essay.json' : essayData,
};

export function getBooksIndex() {
  return Array.isArray(indexData?.books) ? indexData.books : [];
}

export function getBookById(bookId) {
  const meta = getBooksIndex().find(b => b.id === bookId);
  if (!meta) return null;
  const book = BOOKS_BY_FILE[meta.file];
  if (!book) return null;
  return book;
}

export function getChapter(bookId, chapterNumber) {
  const book = getBookById(bookId);
  if (!book) return { book: null, chapter: null };
  const num = Number(chapterNumber);
  const chapter = book.chapters?.find(c => c.number === num) || null;
  return { book, chapter };
}
