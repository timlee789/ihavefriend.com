'use client';

/**
 * TextSlot — caption editor + voice trigger for a photobook page.
 *
 * Structure:
 *   <textarea>           caption editor (auto-saves on blur)
 *   🎙 voice button     opens VoiceCommentRecorder
 *   원문 보기            optional reveal of caption_raw (whisper output)
 *
 * The page also renders an AudioPlayerCard below this slot when an
 * audio row exists, but the recorder is owned here because the entry
 * point (🎙 button) lives next to the caption.
 *
 * Auto-save: on blur, if caption changed, calls onSaveCaption(text).
 * Photo / audio state lives on the parent (PageCanvas) so this slot
 * stays focused on text + recording.
 *
 * Props:
 *   photobookId   : UUID
 *   pageId        : UUID
 *   caption       : current saved value
 *   captionRaw    : whisper-derived original (read-only)
 *   lang          : 'KO' | 'EN' | 'ES'
 *   onSaveCaption(newText)
 *   onAudioSaved({ audio, transcript })  — when recorder uploads audio
 */

import { useEffect, useRef, useState } from 'react';
import { pbMsgs } from './photobookI18n';
import VoiceCommentRecorder from './VoiceCommentRecorder';

export default function TextSlot({
  photobookId,
  pageId,
  caption,
  captionRaw,
  lang = 'KO',
  onSaveCaption,
  onAudioSaved,
}) {
  const m = pbMsgs(lang);
  const [text, setText] = useState(caption || '');
  const [showRaw, setShowRaw] = useState(false);
  const [savingHint, setSavingHint] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const lastSavedRef = useRef(caption || '');

  // Sync from parent when the page changes (e.g. user navigates to next).
  useEffect(() => {
    setText(caption || '');
    lastSavedRef.current = caption || '';
    setShowRaw(false);
  }, [caption, pageId]);

  function handleBlur() {
    const next = text.trim();
    if (next === (lastSavedRef.current || '')) return;
    lastSavedRef.current = next;
    onSaveCaption?.(next);
    // Show "Saved" briefly. Parent owns the actual fetch; we just nudge
    // the user that the blur triggered a save.
    setSavingHint(true);
    window.setTimeout(() => setSavingHint(false), 1400);
  }

  function handleRecorderSaved({ transcript, audio }) {
    setRecOpen(false);
    // Append (or replace if empty) the transcript into the textarea
    // AND auto-save it to the server immediately.
    //
    // 🔥 2026-05-06 (Tim) — previously this only set local textarea
    // state; the user had to blur the textarea for the caption to
    // save. If they navigated to another page first, the transcript
    // was lost when the textarea reset from the empty parent caption
    // on return. Saving here closes that gap.
    let nextText = text;
    if (transcript) {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        nextText = transcript;
      } else if (captionRaw && trimmed === (captionRaw || '').trim()) {
        // Previous text was a stale Whisper result — replace it.
        nextText = transcript;
      } else {
        // Otherwise append, separated by a blank line, so the user
        // can merge by hand.
        nextText = `${trimmed}\n\n${transcript}`;
      }
      setText(nextText);
      // Persist immediately so it survives page navigation. lastSavedRef
      // updates so the next blur won't re-fire an identical save.
      const trimmedNext = nextText.trim();
      if (trimmedNext !== (lastSavedRef.current || '')) {
        lastSavedRef.current = trimmedNext;
        onSaveCaption?.(trimmedNext);
      }
    }
    onAudioSaved?.({ transcript, audio });
  }

  return (
    <div className="textSlot">
      <textarea
        className="ta"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder={m.captionPlaceholder}
        rows={5}
        maxLength={5000}
      />

      <div className="row">
        <button
          type="button"
          className="voiceBtn"
          onClick={() => setRecOpen(true)}
        >
          {m.captionVoiceBtn}
        </button>
        {savingHint && <span className="savingHint">{m.captionSavingHint}</span>}
      </div>

      {captionRaw && captionRaw.trim() && captionRaw.trim() !== text.trim() && (
        <div className="rawWrap">
          <button
            type="button"
            className="rawToggle"
            onClick={() => setShowRaw(s => !s)}
          >
            {showRaw ? m.captionHideRaw : m.captionShowRaw}
          </button>
          {showRaw && (
            <div className="rawBox">
              <div className="rawLabel">{m.captionRawLabel}</div>
              <div className="rawText">{captionRaw}</div>
            </div>
          )}
        </div>
      )}

      {recOpen && (
        <VoiceCommentRecorder
          photobookId={photobookId}
          pageId={pageId}
          lang={lang}
          onSaved={handleRecorderSaved}
          onCancel={() => setRecOpen(false)}
        />
      )}

      <style jsx>{`
        .textSlot { display: flex; flex-direction: column; gap: 8px; }
        .ta {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.92);
          border: 1.5px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 14px;
          font-size: 16px;
          line-height: 1.55;
          font-family: inherit;
          outline: none;
          resize: vertical;
          min-height: 120px;
          transition: border-color 0.15s;
        }
        .ta:focus { border-color: #fb923c; }
        .ta::placeholder { color: rgba(255, 255, 255, 0.38); }
        .row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .voiceBtn {
          min-height: 48px;
          padding: 10px 18px;
          background: linear-gradient(135deg, #fb923c, #ea580c);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .voiceBtn:hover  { opacity: 0.92; }
        .voiceBtn:active { transform: scale(0.98); }
        .savingHint {
          font-size: 12.5px;
          color: #86efac;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        .rawWrap {
          margin-top: 4px;
        }
        .rawToggle {
          background: transparent;
          border: none;
          color: #fb923c;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 0;
          cursor: pointer;
          font-family: inherit;
        }
        .rawToggle:hover { text-decoration: underline; }
        .rawBox {
          margin-top: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .rawLabel {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.4px;
          margin-bottom: 6px;
        }
        .rawText {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.78);
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}
