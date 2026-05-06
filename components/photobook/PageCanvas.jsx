'use client';

/**
 * PageCanvas — single-page editor surface (mobile vertical layout).
 *
 * Stack (top → bottom):
 *   1. page_number badge + page_title input
 *   2. <PhotoSlot>
 *   3. <TextSlot>      (caption + voice-record trigger)
 *   4. <AudioPlayerCard> when audio exists
 *
 * State strategy:
 *   - Receives the full `page` object (including .photo and .audio).
 *   - When children mutate photo / audio / caption, calls onPatchPage()
 *     with a partial that the parent merges into its pages array.
 *   - PageCanvas itself owns no remote state — it's a pure presenter
 *     plus blur-debounced caption save.
 *
 * Props:
 *   photobookId  : UUID
 *   page         : { id, page_number, page_title, caption, caption_raw, photo, audio }
 *   lang         : 'KO' | 'EN' | 'ES'
 *   onPatchPage(partial)  — partial may contain { page_title, caption, photo, audio }
 */

import { useEffect, useRef, useState } from 'react';
import { pbMsgs } from './photobookI18n';
import { patchPage } from './photobookFetch';
import PhotoSlot from './PhotoSlot';
import TextSlot from './TextSlot';
import AudioPlayerCard from './AudioPlayerCard';

export default function PageCanvas({
  photobookId,
  page,
  lang = 'KO',
  onPatchPage,
}) {
  const m = pbMsgs(lang);
  const [titleDraft, setTitleDraft] = useState(page.page_title || '');
  const lastSavedTitle = useRef(page.page_title || '');

  useEffect(() => {
    setTitleDraft(page.page_title || '');
    lastSavedTitle.current = page.page_title || '';
  }, [page.id, page.page_title]);

  async function commitTitle() {
    const next = (titleDraft || '').trim();
    if (next === (lastSavedTitle.current || '')) return;
    lastSavedTitle.current = next;
    try {
      const res = await patchPage(photobookId, page.id, { page_title: next });
      onPatchPage?.({ page_title: res.page?.page_title ?? next });
    } catch (e) {
      console.error('[PageCanvas] title patch failed:', e?.message);
    }
  }

  async function handleSaveCaption(text) {
    try {
      const res = await patchPage(photobookId, page.id, { caption: text });
      onPatchPage?.({
        caption: res.page?.caption ?? text,
        caption_raw: res.page?.caption_raw ?? page.caption_raw,
      });
    } catch (e) {
      console.error('[PageCanvas] caption patch failed:', e?.message);
    }
  }

  function handlePhotoChange(photo) {
    onPatchPage?.({ photo });
  }

  function handleAudioSaved({ audio, transcript }) {
    // The audio POST handler also wrote caption_raw on the server; we
    // mirror that here so the UI reflects the new "원문" without a refetch.
    onPatchPage?.({
      audio,
      caption_raw: transcript || page.caption_raw,
    });
  }

  function handleAudioChange(audio) {
    onPatchPage?.({ audio });
  }

  return (
    <div className="canvas">
      <div className="meta">
        <span className="num">{m.pageNumberLabel(page.page_number)}</span>
        <input
          className="titleInput"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          placeholder={m.pageTitlePlaceholder}
          maxLength={200}
        />
      </div>

      <PhotoSlot
        photobookId={photobookId}
        pageId={page.id}
        photo={page.photo}
        lang={lang}
        onChange={handlePhotoChange}
      />

      <TextSlot
        photobookId={photobookId}
        pageId={page.id}
        caption={page.caption}
        captionRaw={page.caption_raw}
        lang={lang}
        onSaveCaption={handleSaveCaption}
        onAudioSaved={handleAudioSaved}
      />

      {page.audio && (
        <AudioPlayerCard
          photobookId={photobookId}
          pageId={page.id}
          audio={page.audio}
          lang={lang}
          onChange={handleAudioChange}
        />
      )}

      <style jsx>{`
        .canvas {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          padding-bottom: 130px; /* room for the fixed bottom navigator */
          max-width: 560px;
          margin: 0 auto;
        }
        .meta {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .num {
          flex-shrink: 0;
          font-size: 12px;
          font-weight: 700;
          color: #fdba74;
          background: rgba(251, 146, 60, 0.16);
          padding: 6px 12px;
          border-radius: 999px;
          letter-spacing: 0.4px;
        }
        .titleInput {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.95);
          font-size: 17px;
          font-weight: 700;
          font-family: inherit;
          padding: 8px 0;
          outline: none;
          border-bottom: 1.5px solid transparent;
          transition: border-color 0.15s;
        }
        .titleInput:focus {
          border-bottom-color: rgba(251, 146, 60, 0.5);
        }
        .titleInput::placeholder {
          color: rgba(255, 255, 255, 0.38);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
