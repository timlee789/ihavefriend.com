'use client';

/**
 * VoiceCommentRecorder — bottom-sheet voice recorder for a photobook page.
 *
 * Mobile-first, senior-friendly. Big ⏺ button, big ⏹, clear states.
 * On stop:
 *   1. POST /api/transcribe (Whisper)         → transcript
 *   2. POST /api/photobooks/.../audio (R2)    → audio row + public_token
 * Both happen sequentially; if Whisper fails the audio still uploads
 * (caller still receives an audio row, just without whisperText).
 *
 * MediaRecorder pattern follows the voice-QR system (EmmaChat Task 80
 * / Task 99): single coherent WebM, no timeslice, 64 kbps opus. See
 * components/emma/EmmaChat.jsx around line 2369 for the reference.
 *
 * Props:
 *   photobookId   : UUID
 *   pageId        : UUID
 *   lang          : 'KO' | 'EN' | 'ES'
 *   onSaved({ transcript, audio })  — called once both calls finish
 *   onCancel()    — close without saving
 */

import { useEffect, useRef, useState } from 'react';
import { pbMsgs } from './photobookI18n';
import { uploadPageAudio, transcribeAudio } from './photobookFetch';

const MAX_DURATION_SEC = 300; // 5 min — server caps at the same number
const MIN_AUDIO_BYTES = 1024; // < 1KB usually means the recorder never started

const REC_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of REC_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function VoiceCommentRecorder({
  photobookId,
  pageId,
  lang = 'KO',
  onSaved,
  onCancel,
}) {
  const m = pbMsgs(lang);

  // Phase machine: idle → recording → preview → uploading → done
  // (preview gives the user one tap to "use this text" or re-record)
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [maxReached, setMaxReached] = useState(false);
  const [transcript, setTranscript] = useState('');
  // Whisper failure shouldn't block upload — track it separately so the
  // user can still save the audio with no transcript.
  const [transcribeFailed, setTranscribeFailed] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('audio/webm');
  const blobRef = useRef(null);
  const durationRef = useRef(0);
  const tickRef = useRef(null);
  const startedAtRef = useRef(0);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTick();
      try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function startRecording() {
    setError('');
    setMaxReached(false);
    setTranscript('');
    setTranscribeFailed(false);
    blobRef.current = null;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMime();
      mimeRef.current = mime || 'audio/webm';
      const opts = mime
        ? { mimeType: mime, audioBitsPerSecond: 64000 }
        : { audioBitsPerSecond: 64000 };

      const rec = new MediaRecorder(stream, opts);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = (e) => {
        console.warn('[photobook rec] recorder error:', e?.error?.message || e);
      };
      // No timeslice — single coherent container (Task 99 lesson).
      rec.start();
      recorderRef.current = rec;

      startedAtRef.current = Date.now();
      setSeconds(0);
      tickRef.current = setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(elapsed);
        if (elapsed >= MAX_DURATION_SEC) {
          setMaxReached(true);
          stopRecording();
        }
      }, 250);

      setPhase('recording');
    } catch (e) {
      console.error('[photobook rec] mic open failed:', e?.message);
      const denied =
        e?.name === 'NotAllowedError' ||
        e?.name === 'PermissionDeniedError' ||
        /denied|permission/i.test(e?.message || '');
      setError(denied ? m.recMicDenied : m.recMicError);
      setPhase('idle');
    }
  }

  function stopRecording() {
    stopTick();
    const rec = recorderRef.current;
    if (!rec) return;

    const elapsed = (Date.now() - startedAtRef.current) / 1000;
    durationRef.current = Math.min(elapsed, MAX_DURATION_SEC);

    rec.onstop = async () => {
      // Tear down the mic so the OS indicator clears immediately.
      try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      blobRef.current = blob;
      console.log(
        `[photobook rec] stopped: ${chunksRef.current.length} chunks, ` +
        `${blob.size} bytes, ${durationRef.current.toFixed(1)}s, mime=${mimeRef.current}`
      );

      if (blob.size < MIN_AUDIO_BYTES) {
        setError(m.recEmpty);
        setPhase('idle');
        return;
      }

      // Whisper first — gives the user a transcript to confirm/edit.
      setPhase('processing');
      try {
        const text = await transcribeAudio(blob, (lang || 'ko').toLowerCase());
        setTranscript(text || '');
      } catch (e) {
        console.warn('[photobook rec] transcribe failed:', e?.message);
        setTranscribeFailed(true);
        setTranscript('');
      }
      setPhase('preview');
    };

    try {
      if (rec.state === 'recording') rec.stop();
    } catch (e) {
      console.warn('[photobook rec] stop threw:', e?.message);
      setError(m.recMicError);
      setPhase('idle');
    }
  }

  async function commitUpload() {
    const blob = blobRef.current;
    if (!blob) {
      setError(m.recUploadFailed);
      setPhase('idle');
      return;
    }
    setPhase('uploading');
    try {
      const audio = await uploadPageAudio(
        photobookId,
        pageId,
        blob,
        durationRef.current,
        transcript || null
      );
      onSaved?.({ transcript, audio });
    } catch (e) {
      console.error('[photobook rec] upload failed:', e?.message);
      setError(e?.message || m.recUploadFailed);
      setPhase('preview');
    }
  }

  function handleRetry() {
    setTranscript('');
    setTranscribeFailed(false);
    setError('');
    setMaxReached(false);
    blobRef.current = null;
    setPhase('idle');
  }

  // ── Render ────────────────────────────────────────────────────
  const hint = (() => {
    switch (phase) {
      case 'recording':  return m.recHintRecording;
      case 'processing': return m.recHintProcessing;
      case 'uploading':  return m.recHintUploading;
      default:           return m.recHintIdle;
    }
  })();

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && phase === 'idle' && onCancel?.()}>
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="handle" />
        <div className="title">{m.recTitle}</div>

        <div className={`hint ${phase === 'recording' ? 'recHint' : ''}`}>{hint}</div>

        {phase !== 'preview' && (
          <div className="clock" aria-live="polite">
            {fmtClock(seconds)}
          </div>
        )}

        {phase === 'preview' && (
          <div className="preview">
            {transcribeFailed ? (
              <div className="errorBox" style={{ whiteSpace: 'pre-line' }}>
                {m.recTranscribeFailed}
              </div>
            ) : transcript ? (
              <textarea
                className="textPreview"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={5}
              />
            ) : (
              <div className="hint">{m.recHintProcessing}</div>
            )}
          </div>
        )}

        {phase === 'idle' && !error && (
          <div className="hintSmall">{m.recMaxDurationHint(MAX_DURATION_SEC)}</div>
        )}

        {maxReached && phase === 'preview' && (
          <div className="hintSmall">{m.recMaxReachedHint}</div>
        )}

        {error && <div className="errorBox">{error}</div>}

        <div className="btnRow">
          {phase === 'idle' && (
            <>
              <button className="btnSecondary" onClick={onCancel} type="button">
                {m.recCancel}
              </button>
              <button className="btnRecord" onClick={startRecording} type="button" aria-label={m.recStart}>
                <span className="recDot" /> {m.recStart}
              </button>
            </>
          )}

          {phase === 'recording' && (
            <button className="btnStop" onClick={stopRecording} type="button" aria-label={m.recStop}>
              <span className="stopSquare" /> {m.recStop}
            </button>
          )}

          {(phase === 'processing' || phase === 'uploading') && (
            <button className="btnPrimary" disabled type="button">
              {phase === 'processing' ? m.recHintProcessing : m.recHintUploading}
            </button>
          )}

          {phase === 'preview' && (
            <>
              <button className="btnSecondary" onClick={handleRetry} type="button">
                {m.recRetry}
              </button>
              <button className="btnPrimary" onClick={commitUpload} type="button">
                {m.recUseTranscript}
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 1000;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          animation: fadeIn 0.18s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .sheet {
          width: 100%;
          max-width: 560px;
          background: #1a1410;
          color: rgba(255, 255, 255, 0.92);
          border-radius: 24px 24px 0 0;
          padding: 14px 20px calc(20px + env(safe-area-inset-bottom, 0px));
          box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
          animation: slideUp 0.22s cubic-bezier(0.32, 0.72, 0, 1);
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .handle {
          width: 36px;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          margin: 0 auto 14px;
        }
        .title {
          font-size: 18px;
          font-weight: 700;
          color: #fdf8f4;
          text-align: center;
          margin-bottom: 14px;
        }
        .hint {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.78);
          text-align: center;
          margin-bottom: 12px;
          line-height: 1.45;
        }
        .recHint { color: #fdba74; font-weight: 600; }
        .hintSmall {
          font-size: 12.5px;
          color: rgba(255, 255, 255, 0.55);
          text-align: center;
          margin: 6px 0 4px;
        }
        .clock {
          font-variant-numeric: tabular-nums;
          font-size: 44px;
          font-weight: 700;
          color: #fdf8f4;
          text-align: center;
          letter-spacing: 1px;
          margin: 6px 0 18px;
        }
        .preview { margin-bottom: 12px; }
        .textPreview {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.92);
          border: 1.5px solid rgba(251, 146, 60, 0.4);
          border-radius: 12px;
          padding: 12px;
          font-size: 15px;
          line-height: 1.5;
          font-family: inherit;
          outline: none;
          resize: vertical;
        }
        .textPreview:focus { border-color: #fb923c; }
        .errorBox {
          background: rgba(239, 68, 68, 0.14);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13.5px;
          margin: 8px 0;
        }
        .btnRow {
          display: flex;
          gap: 10px;
          margin-top: 6px;
        }
        .btnRow button {
          flex: 1;
          min-height: 56px;
          border: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 14px;
          transition: opacity 0.15s, transform 0.1s;
        }
        .btnRow button:active { transform: scale(0.98); }
        .btnRow button:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .btnPrimary {
          background: linear-gradient(135deg, #fb923c, #ea580c);
          color: #fff;
        }
        .btnSecondary {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.85);
        }
        .btnRecord {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
        }
        .btnStop {
          background: linear-gradient(135deg, #ef4444, #b91c1c);
          color: #fff;
          flex: 1;
        }
        .recDot {
          width: 14px; height: 14px;
          background: #fff;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.7; transform: scale(0.92); }
        }
        .stopSquare {
          width: 14px; height: 14px;
          background: #fff;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
