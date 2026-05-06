'use client';

/**
 * AudioPlayerCard — page-level audio surface.
 *
 * Shown beneath TextSlot when the page has an audio row. Surfaces:
 *   - <audio> player streaming /api/audio/[token]
 *   - Share-on/off toggle (PATCH is_public)
 *   - QR-code preview (live image generated from public URL)
 *   - Listen-link copy
 *   - Delete button
 *
 * The QR is rendered with the existing `qrcode` package (already a
 * dependency for the PDF flow). Same library, same encoding — the
 * preview matches what'll appear on the printed page.
 *
 * Props:
 *   photobookId : UUID
 *   pageId      : UUID
 *   audio       : { id, public_token, duration_sec, is_public, … }
 *   lang        : 'KO' | 'EN' | 'ES'
 *   onChange(audio | null) — updated audio row, or null on delete
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { pbMsgs } from './photobookI18n';
import { patchAudioVisibility, deletePageAudio } from './photobookFetch';

function fmtDuration(sec) {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AudioPlayerCard({
  photobookId,
  pageId,
  audio,
  lang = 'KO',
  onChange,
}) {
  const m = pbMsgs(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Build the family listen URL. Use window.location.origin for the
  // preview so the QR works in dev too. The real domain is what's
  // burned into the printed PDF (server-side); this preview is just
  // for the user to see "yes, the QR will go on the page".
  const listenUrl = (() => {
    if (typeof window === 'undefined' || !audio?.public_token) return '';
    const origin = window.location.origin;
    return `${origin}/listen/${audio.public_token}`;
  })();

  useEffect(() => {
    if (!listenUrl) { setQrDataUrl(''); return; }
    let cancelled = false;
    QRCode.toDataURL(listenUrl, { width: 140, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url); })
      .catch(e => console.warn('[AudioPlayerCard] QR failed:', e?.message));
    return () => { cancelled = true; };
  }, [listenUrl]);

  async function handleToggleShare() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await patchAudioVisibility(
        photobookId, pageId, !audio.is_public
      );
      onChange?.(updated);
    } catch (e) {
      console.error('[AudioPlayerCard] toggle failed:', e?.message);
      setError(e?.message || m.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    if (!window.confirm(m.audioDeleteConfirm)) return;
    setBusy(true);
    setError('');
    try {
      await deletePageAudio(photobookId, pageId);
      onChange?.(null);
    } catch (e) {
      console.error('[AudioPlayerCard] delete failed:', e?.message);
      setError(e?.message || m.error);
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!listenUrl) return;
    try {
      await navigator.clipboard.writeText(listenUrl);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      // Fallback: select-the-text method
      try {
        const ta = document.createElement('textarea');
        ta.value = listenUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1800);
      } catch (e) {
        console.warn('[AudioPlayerCard] copy failed:', e?.message);
      }
    }
  }

  return (
    <div className="card">
      <div className="rowTop">
        <div className="label">{m.audioPlayerLabel}</div>
        <div className="duration">{fmtDuration(audio.duration_sec)}</div>
      </div>

      <audio
        key={audio.id}
        controls
        preload="metadata"
        src={`/api/audio/${audio.public_token}`}
        className="player"
      />

      <div className="shareRow">
        <div className="shareLabel">
          {m.audioShareLabel}
          <span className={`shareState ${audio.is_public ? 'on' : 'off'}`}>
            {audio.is_public ? m.audioShareOn : m.audioShareOff}
          </span>
        </div>
        <button
          type="button"
          className={`toggle ${audio.is_public ? 'on' : ''}`}
          onClick={handleToggleShare}
          disabled={busy}
          aria-label={m.audioShareLabel}
        >
          <span className="knob" />
        </button>
      </div>

      <div className="shareHelp">{m.audioShareHelp}</div>

      {audio.is_public && (
        <>
          {qrDataUrl && (
            <div className="qrWrap">
              <img src={qrDataUrl} alt="QR" className="qr" />
              <div className="qrLabel">{m.audioQrLabel}</div>
            </div>
          )}
          {listenUrl && (
            <div className="linkRow">
              <div className="linkLabel">{m.audioListenLink}</div>
              <div className="linkVal">{listenUrl}</div>
              <button
                type="button"
                className="copyBtn"
                onClick={handleCopyLink}
              >
                {linkCopied ? m.audioLinkCopied : m.audioCopyLink}
              </button>
            </div>
          )}
        </>
      )}

      {error && <div className="err">{error}</div>}

      <button
        type="button"
        className="deleteBtn"
        onClick={handleDelete}
        disabled={busy}
      >
        {m.audioDelete}
      </button>

      <style jsx>{`
        .card {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(251, 146, 60, 0.18);
          border-radius: 14px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rowTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .label {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.65);
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }
        .duration {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.55);
          font-variant-numeric: tabular-nums;
        }
        .player {
          width: 100%;
          height: 44px;
          accent-color: #fb923c;
        }
        .shareRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .shareLabel {
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 600;
        }
        .shareState {
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.3px;
        }
        .shareState.on  { color: #86efac; }
        .shareState.off { color: rgba(255, 255, 255, 0.4); }
        .toggle {
          width: 52px;
          height: 32px;
          border-radius: 16px;
          border: none;
          cursor: pointer;
          position: relative;
          background: rgba(255, 255, 255, 0.18);
          transition: background 0.18s;
          flex-shrink: 0;
        }
        .toggle:disabled { opacity: 0.5; cursor: not-allowed; }
        .toggle.on { background: linear-gradient(135deg, #fb923c, #ea580c); }
        .knob {
          position: absolute;
          top: 4px;
          left: 4px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.18s;
        }
        .toggle.on .knob { transform: translateX(20px); }
        .shareHelp {
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.55);
          line-height: 1.45;
        }
        .qrWrap {
          align-self: center;
          background: #fff;
          padding: 10px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .qr {
          width: 140px;
          height: 140px;
          display: block;
        }
        .qrLabel {
          font-size: 11px;
          color: #555;
          text-align: center;
          max-width: 140px;
          line-height: 1.3;
        }
        .linkRow {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .linkLabel {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.55);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .linkVal {
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.85);
          word-break: break-all;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .copyBtn {
          align-self: flex-start;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.10);
          border: none;
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 12.5px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
        }
        .copyBtn:hover { background: rgba(255, 255, 255, 0.16); }
        .deleteBtn {
          align-self: flex-start;
          padding: 8px 14px;
          background: rgba(239, 68, 68, 0.18);
          color: #fca5a5;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
        }
        .deleteBtn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.28); }
        .deleteBtn:disabled { opacity: 0.5; cursor: not-allowed; }
        .err {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 12.5px;
        }
      `}</style>
    </div>
  );
}
