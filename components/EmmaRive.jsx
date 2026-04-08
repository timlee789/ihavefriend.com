'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

// Use @rive-app/canvas directly (not the React wrapper)
// This gives full control over WASM URL before any Rive instance is created.
const WASM_URL = '/rive.wasm';

export default function EmmaRive({ emotionData, isSpeaking, isListening, subtitle, onReady }) {
  const canvasRef       = useRef(null);
  const riveRef         = useRef(null);
  const visemeInputRef  = useRef(null);
  const eyeXInputRef    = useRef(null);
  const eyeYInputRef    = useRef(null);
  const eyelidDownRef   = useRef(null);
  const visemeIntervalRef = useRef(null);
  const blinkTimerRef   = useRef(null);
  const [isLoaded, setIsLoaded]   = useState(false);
  const [loadError, setLoadError] = useState(null);

  // ===== INIT RIVE (direct canvas API) =====
  useEffect(() => {
    let r = null;
    let cancelled = false;

    async function init() {
      try {
        // Dynamic import — loads @rive-app/canvas (includes its own WASM loader)
        const { Rive, Layout, Fit, Alignment, RuntimeLoader } = await import('@rive-app/canvas');

        // Set WASM URL BEFORE new Rive() so RuntimeLoader singleton uses local file
        RuntimeLoader.setWasmUrl(WASM_URL);

        if (cancelled) return;

        r = new Rive({
          src: '/emma.riv',
          // No artboard specified → use default artboard in the .riv file
          stateMachines: 'Grid',   // ← confirmed state machine name from debug log
          canvas: canvasRef.current,
          autoplay: true,
          layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
          wasmUrl: WASM_URL, // tell Rive exactly where to find WASM
          onLoad: () => {
            if (cancelled) return;
            console.log('[EmmaRive] .riv loaded ✓');

            // ── Debug: immediate introspection ──
            console.log('[EmmaRive] animationNames:', r.animationNames);
            console.log('[EmmaRive] stateMachineNames:', r.stateMachineNames);
            r.play('Grid');
            const immediateInputs = r.stateMachineInputs('Grid');
            console.log('[EmmaRive] immediate inputs:', immediateInputs?.length, immediateInputs);

            // ── Delayed introspection: SM may need a tick to register inputs ──
            setTimeout(() => {
              try {
                const inputs = r.stateMachineInputs('Grid');
                console.log('[EmmaRive] delayed inputs (500ms):', inputs?.length, inputs);
                if (inputs?.length) {
                  inputs.forEach((inp, i) =>
                    console.log(`  [${i}] name="${inp.name}" type=${inp.type} value=${inp.value}`)
                  );
                  // Hook up
                  for (const inp of inputs) {
                    if (inp.name === 'eyeX')       eyeXInputRef.current    = inp;
                    if (inp.name === 'eyeY')       eyeYInputRef.current    = inp;
                    if (inp.name === 'EyelidDown') eyelidDownRef.current   = inp;
                    if (inp.name === 'Viseme')     visemeInputRef.current  = inp;
                  }
                }
              } catch (e) {
                console.warn('[EmmaRive] delayed input check error:', e.message);
              }
            }, 500);

            riveRef.current = r;
            setIsLoaded(true);
            if (onReady) onReady();
          },
          onLoadError: (e) => {
            console.warn('[EmmaRive] load error:', e);
            setLoadError(e?.data || 'Load failed');
          },
        });
      } catch (e) {
        if (!cancelled) {
          console.warn('[EmmaRive] init failed:', e.message);
          setLoadError(e.message);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
      if (r) { try { r.cleanup(); } catch {} }
      riveRef.current = null;
      visemeInputRef.current = null;
      eyeXInputRef.current = null;
      eyeYInputRef.current = null;
      eyelidDownRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== EYE TRACKING =====
  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!eyeXInputRef.current || !eyeYInputRef.current) return;
      eyeXInputRef.current.value = (e.clientX / window.innerWidth) * 100;
      eyeYInputRef.current.value = (e.clientY / window.innerHeight) * 100;
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  // ===== NATURAL BLINK =====
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 2500;
      return setTimeout(() => {
        const inp = eyelidDownRef.current;
        if (inp) {
          if (typeof inp.fire === 'function')        inp.fire();
          else if (typeof inp.value === 'boolean') { inp.value = true; setTimeout(() => { inp.value = false; }, 150); }
        }
        blinkTimerRef.current = scheduleBlink();
      }, delay);
    };
    blinkTimerRef.current = scheduleBlink();
    return () => clearTimeout(blinkTimerRef.current);
  }, []);

  // ===== LIP SYNC =====
  const stopLipSync = useCallback(() => {
    if (visemeIntervalRef.current) {
      clearInterval(visemeIntervalRef.current);
      visemeIntervalRef.current = null;
    }
    if (visemeInputRef.current) visemeInputRef.current.value = 0;
  }, []);

  const startLipSync = useCallback(() => {
    if (visemeIntervalRef.current) return;
    const pattern = [0, 2, 5, 3, 1, 4, 6, 2, 0, 3, 5, 1, 4, 0, 7, 2, 1, 0];
    let idx = 0;
    visemeIntervalRef.current = setInterval(() => {
      if (visemeInputRef.current) {
        visemeInputRef.current.value = pattern[idx % pattern.length];
        idx++;
      }
    }, 100 + Math.random() * 60);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSpeaking) startLipSync();
    else stopLipSync();
    return stopLipSync;
  }, [isSpeaking, isLoaded, startLipSync, stopLipSync]);

  // ===== CLEANUP =====
  useEffect(() => {
    return () => {
      stopLipSync();
      clearTimeout(blinkTimerRef.current);
    };
  }, [stopLipSync]);

  // ===== RESIZE canvas to fill container =====
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (canvasRef.current) {
          canvasRef.current.width  = width  * window.devicePixelRatio;
          canvasRef.current.height = height * window.devicePixelRatio;
          canvasRef.current.style.width  = width  + 'px';
          canvasRef.current.style.height = height + 'px';
        }
      }
    });
    ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFCF8' }}>

      {/* Loading state */}
      {!isLoaded && !loadError && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', color: '#888', zIndex: 2,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: '#F5C4B3', margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#4A1B0C',
          }}>E</div>
          <p style={{ fontSize: 14, margin: 0 }}>Emma is getting ready...</p>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center', color: '#999', zIndex: 2, padding: 20,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🙂</div>
          <p style={{ fontSize: 13, margin: 0 }}>Emma</p>
        </div>
      )}

      {/* Rive canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: '100%', height: '100%',
          display: 'block',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '90%', padding: '10px 20px',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff', borderRadius: 12,
          fontSize: 15, lineHeight: 1.5,
          textAlign: 'center', pointerEvents: 'none',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
