# RIVE-EMMA-CLAUDE-v2.md — Emma Rive Avatar Integration

## THIS REPLACES: TALKINGHEAD-CLAUDE.md
Remove TalkingHead.js and Three.js from the project entirely.

## Source File
Tim's modified `expression_grid.riv` → rename to `emma.riv` → place in `public/emma.riv`

## Analyzed File Structure

### Artboard: "Main Grid"
### State Machine: "State Machine 1"

Sub-state-machines inside:
- **Face State** — expression switching (Idle ↔ 7+ expressions)
- **Eye State** — eye tracking + blink (Anim Eye)
- **Mouth State** — lip-sync via Viseme input

### Confirmed Inputs:
| Input Name | Type | Purpose |
|---|---|---|
| `eyeX` | Number | Eye horizontal position (0-100) |
| `eyeY` | Number | Eye vertical position (0-100) |
| `EyelidDown` | Trigger/Bool | Close eyelids |
| `EyelidUp` | Trigger/Bool | Open eyelids |
| `Viseme` | Number | Mouth shape for lip-sync |

### Available Expressions (in Face State):
- Default (neutral)
- Joy (happy)
- Mad (angry)
- Love you (affectionate)
- Interesting (curious)
- Hello (greeting)
- Yes (agreement/nod)
- What Do You Mean (confused)
- Damn You (frustrated — rename to "Worried" later)
- You Bastard (unused for Emma)

### Animations:
- Idle — resting state with subtle motion
- Grid — expression grid transitions
- Anim Eye — eye animation cycle

## Step 1: Install Rive, Remove TalkingHead

```bash
# Install
npm install @rive-app/react-canvas

# Remove old avatar system
npm uninstall @met4citizen/talkinghead three

# Delete old files
rm -f components/EmmaAvatar.jsx
rm -f public/avatars/emma.glb
```

## Step 2: Place the .riv File

```bash
# Rename and copy to public folder
cp expression_grid.riv public/emma.riv
```

## Step 3: Create EmmaRive Component

Create file: `components/EmmaRive.jsx`

```jsx
'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { useRive, useStateMachineInput, Layout, Fit, Alignment } from '@rive-app/react-canvas';

export default function EmmaRive({ emotionData, isSpeaking, subtitle, onReady }) {
  const visemeIntervalRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize Rive — names match actual file structure
  const { rive, RiveComponent } = useRive({
    src: '/emma.riv',
    stateMachines: 'State Machine 1',
    artboard: 'Main Grid',
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    onLoad: () => {
      setIsLoaded(true);
      if (onReady) onReady();
    },
  });

  // ===== STATE MACHINE INPUTS =====

  // Eye tracking
  const eyeXInput = useStateMachineInput(rive, 'State Machine 1', 'eyeX');
  const eyeYInput = useStateMachineInput(rive, 'State Machine 1', 'eyeY');

  // Eyelids (blink)
  const eyelidDownInput = useStateMachineInput(rive, 'State Machine 1', 'EyelidDown');
  const eyelidUpInput = useStateMachineInput(rive, 'State Machine 1', 'EyelidUp');

  // Lip-sync
  const visemeInput = useStateMachineInput(rive, 'State Machine 1', 'Viseme');

  // ===== EXPRESSION CONTROL =====
  // NOTE FOR CLAUDE CODE:
  // The expression switching mechanism needs to be identified.
  // Check the debug console output (Step 6) for the exact input name.
  // Then uncomment and update the relevant pattern below.
  //
  // Pattern A: Number input selecting expression index
  // const expressionInput = useStateMachineInput(rive, 'State Machine 1', 'INPUT_NAME_HERE');
  //
  // Pattern B: Individual triggers for each expression
  // const joyTrigger = useStateMachineInput(rive, 'State Machine 1', 'Joy');
  // const helloTrigger = useStateMachineInput(rive, 'State Machine 1', 'Hello');

  // ===== EYE TRACKING — eyes follow pointer =====
  useEffect(() => {
    if (!eyeXInput || !eyeYInput) return;

    const handlePointerMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      eyeXInput.value = x;
      eyeYInput.value = y;
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [eyeXInput, eyeYInput]);

  // ===== NATURAL BLINK =====
  useEffect(() => {
    if (!eyelidDownInput) return;

    const blinkInterval = setInterval(() => {
      if (typeof eyelidDownInput.fire === 'function') {
        eyelidDownInput.fire();
      } else if (typeof eyelidDownInput.value === 'boolean') {
        eyelidDownInput.value = true;
        setTimeout(() => { eyelidDownInput.value = false; }, 150);
      }
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, [eyelidDownInput]);

  // ===== LIP SYNC =====
  useEffect(() => {
    if (!visemeInput) return;
    if (isSpeaking) {
      startLipSync();
    } else {
      stopLipSync();
    }
    return () => stopLipSync();
  }, [isSpeaking, visemeInput]);

  const startLipSync = useCallback(() => {
    if (visemeIntervalRef.current) return;
    const speechPattern = [0, 2, 5, 3, 1, 4, 6, 2, 0, 3, 5, 1, 4, 0, 7, 2, 1, 0];
    let index = 0;

    visemeIntervalRef.current = setInterval(() => {
      if (visemeInput) {
        visemeInput.value = speechPattern[index % speechPattern.length];
        index++;
      }
    }, 100 + Math.random() * 60);
  }, [visemeInput]);

  const stopLipSync = useCallback(() => {
    if (visemeIntervalRef.current) {
      clearInterval(visemeIntervalRef.current);
      visemeIntervalRef.current = null;
    }
    if (visemeInput) visemeInput.value = 0;
  }, [visemeInput]);

  // ===== DEBUG: Log all available inputs =====
  useEffect(() => {
    if (rive) {
      const inputs = rive.stateMachineInputs('State Machine 1');
      if (inputs) {
        console.log('=== RIVE STATE MACHINE INPUTS ===');
        inputs.forEach((input, i) => {
          console.log(`[${i}] name: "${input.name}", type: ${input.type}`);
        });
        console.log('Type 56=Number, 57=Boolean, 58=Trigger');
        console.log('=================================');
      }
    }
  }, [rive]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (visemeIntervalRef.current) clearInterval(visemeIntervalRef.current);
    };
  }, []);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      minHeight: 300,
      background: '#FFFCF8',
    }}>
      {!isLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#888',
          zIndex: 2,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: '#F5C4B3', margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, color: '#4A1B0C',
          }}>E</div>
          <p style={{ fontSize: 14 }}>Emma is getting ready...</p>
        </div>
      )}

      <RiveComponent style={{ width: '100%', height: '100%' }} />

      {subtitle && (
        <div style={{
          position: 'absolute',
          bottom: 16, left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '90%',
          padding: '10px 20px',
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
```

## Step 4: Chat Page (Avatar-Centric Layout)

Create or replace: `app/chat/page.jsx`

```jsx
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import EmmaRive from '@/components/EmmaRive';

export default function ChatPage() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState({ valence: 0.2 });
  const [subtitle, setSubtitle] = useState('');
  const [subtitlesOn, setSubtitlesOn] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const subtitleTimer = useRef(null);

  const showSubtitle = useCallback((text) => {
    if (!subtitlesOn) { setSubtitle(''); return; }
    setSubtitle(text);
    if (subtitleTimer.current) clearTimeout(subtitleTimer.current);
    subtitleTimer.current = setTimeout(() => setSubtitle(''), 8000);
  }, [subtitlesOn]);

  // Proactive greeting from memory engine
  useEffect(() => {
    if (!isReady) return;
    async function loadGreeting() {
      try {
        const res = await fetch('/api/chat/greeting', { method: 'POST' });
        const data = await res.json();
        if (data.greeting) {
          showSubtitle(data.greeting);
          setIsSpeaking(true);
          setTimeout(() => setIsSpeaking(false), data.greeting.length * 60);
        }
      } catch {
        showSubtitle("Hi! Good to see you.");
        setIsSpeaking(true);
        setTimeout(() => setIsSpeaking(false), 2000);
      }
    }
    loadGreeting();
  }, [isReady, showSubtitle]);

  async function sendTextMessage() {
    if (!textInput.trim()) return;
    const message = textInput;
    setTextInput('');
    setTranscript(prev => [...prev, { role: 'user', text: message }]);

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (data.emotion) setCurrentEmotion(data.emotion);
      showSubtitle(data.response);
      setIsSpeaking(true);
      setTranscript(prev => [...prev, { role: 'emma', text: data.response }]);
      const duration = Math.max(2000, data.response.length * 60);
      setTimeout(() => setIsSpeaking(false), duration);
    } catch (e) {
      console.error('Message failed:', e);
      setIsSpeaking(false);
    }
  }

  function startVoiceChat() {
    setIsListening(true);
    // TODO: Connect to existing Gemini Live API WebSocket
    // On each AI response:
    //   1. parseEmotionFromResponse(raw) → setCurrentEmotion(emotion)
    //   2. showSubtitle(cleanText)
    //   3. setIsSpeaking(true) while audio plays
    //   4. setIsSpeaking(false) when audio ends
  }

  function stopVoiceChat() {
    setIsListening(false);
    setIsSpeaking(false);
  }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex', flexDirection: 'column',
      background: '#FFFCF8', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '8px 12px', zIndex: 10,
      }}>
        <button onClick={() => setShowTranscript(!showTranscript)}
          style={{ background: 'rgba(0,0,0,0.08)', border: 'none',
            borderRadius: 20, padding: '6px 14px', fontSize: 12,
            color: '#666', cursor: 'pointer' }}>
          {showTranscript ? 'Hide' : 'Show'} transcript
        </button>
        <button onClick={() => setSubtitlesOn(!subtitlesOn)}
          style={{ background: 'rgba(0,0,0,0.08)', border: 'none',
            borderRadius: 20, padding: '6px 14px', fontSize: 12,
            color: '#666', cursor: 'pointer' }}>
          CC {subtitlesOn ? 'ON' : 'OFF'}
        </button>
      </div>

      <div style={{ flex: '1 1 auto', position: 'relative', minHeight: 0 }}>
        <EmmaRive
          emotionData={currentEmotion}
          isSpeaking={isSpeaking}
          subtitle={subtitle}
          onReady={() => setIsReady(true)}
        />
      </div>

      {showTranscript && (
        <div style={{
          maxHeight: '25vh', overflowY: 'auto',
          padding: '10px 16px', borderTop: '1px solid #eee',
          background: '#fff', fontSize: 13,
        }}>
          {transcript.map((msg, i) => (
            <p key={i} style={{ margin: '4px 0',
              color: msg.role === 'emma' ? '#4A1B0C' : '#0C447C' }}>
              <strong>{msg.role === 'emma' ? 'Emma' : 'You'}:</strong> {msg.text}
            </p>
          ))}
        </div>
      )}

      <div style={{
        padding: '12px 20px 28px',
        display: 'flex', flexDirection: 'column', gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={isListening ? stopVoiceChat : startVoiceChat}
          style={{
            width: '100%', padding: 16, borderRadius: 28, border: 'none',
            background: isListening ? '#E24B4A' : '#F0997B',
            color: isListening ? '#fff' : '#4A1B0C',
            fontSize: 16, fontWeight: 500, cursor: 'pointer',
          }}>
          {isListening ? 'Stop talking' : 'Talk to Emma'}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
            placeholder="or type here..."
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 20,
              border: '1px solid #ddd', background: '#FFF8F0',
              fontSize: 14, outline: 'none',
            }} />
          {textInput && (
            <button onClick={sendTextMessage}
              style={{
                padding: '10px 16px', borderRadius: 20, border: 'none',
                background: '#F0997B', color: '#4A1B0C',
                fontSize: 14, cursor: 'pointer',
              }}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Step 5: Audio-Driven Lip Sync (Phase 2 Upgrade)

Replace simple cycling with audio volume analysis:

```javascript
const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
const dataArray = new Uint8Array(analyser.frequencyBinCount);

function updateMouthFromAudio() {
  if (!isSpeaking) return;
  analyser.getByteFrequencyData(dataArray);
  const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
  const visemeValue = Math.min(7, Math.round(avg / 30));
  visemeInput.value = visemeValue;
  requestAnimationFrame(updateMouthFromAudio);
}
```

## Step 6: CRITICAL — Identify All Inputs

After first run, check browser console (F12 → Console tab).
You should see:

```
=== RIVE STATE MACHINE INPUTS ===
[0] name: "eyeX", type: 56
[1] name: "eyeY", type: 56
...
=================================
```

Type 56=Number, 57=Boolean, 58=Trigger.

**Copy this entire output and give it to Claude Code.**
This reveals the expression control input name needed to
connect the emotion tracker to Emma's facial expressions.

## File Structure

```
public/
  emma.riv              ← Tim's Rive character file
  manifest.json         ← PWA (done)
  sw.js                 ← Service Worker (done)
components/
  EmmaRive.jsx          ← NEW: Rive avatar component
app/
  chat/
    page.jsx            ← UPDATED: avatar-centric layout
lib/
  tokenBudget.js        ← Memory engine (done)
  memoryExtractor.js    ← Memory engine (done)
  recallEngine.js       ← Memory engine (done)
  emotionTracker.js     ← Emotion system (done)
  memoryGraph.js        ← Graph system (done)
  pushNotification.js   ← Push notifications (done)
  dailyOutreach.js      ← SMS outreach (done)
  pwaClient.js          ← PWA client (done)
```

## Dependencies

Add:
```bash
npm install @rive-app/react-canvas
```

Remove:
```bash
npm uninstall @met4citizen/talkinghead three
```

## WASM Preload (optional)

In `app/layout.jsx` head:
```html
<link rel="preload" href="https://unpkg.com/@rive-app/canvas/rive.wasm"
  as="fetch" crossOrigin="anonymous" />
```

## Claude Code Quick Start

```
RIVE-EMMA-CLAUDE-v2.md를 읽고 실행해줘.
1. @rive-app/react-canvas 설치
2. TalkingHead.js 관련 코드 모두 제거
3. components/EmmaRive.jsx 생성
4. chat page를 아바타 중심 레이아웃으로 교체
5. public/emma.riv 파일 확인
6. 실행해서 브라우저 콘솔의 STATE MACHINE INPUTS 로그 확인
```
