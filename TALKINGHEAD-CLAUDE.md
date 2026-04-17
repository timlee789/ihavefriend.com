# TalkingHead.js Integration Guide for sayandkeep.com

## Overview
Replace the current CSS 2D avatar with a full 3D avatar using TalkingHead.js.
Emma will have real-time lip-sync, facial expressions driven by the emotion
tracking system, eye movement, head gestures, and natural idle animations.

## Library Info
- GitHub: https://github.com/met4citizen/TalkingHead
- NPM: @met4citizen/talkinghead (v1.7)
- License: MIT (free, commercial use OK)
- Renders via Three.js/WebGL in browser
- No server-side rendering needed

## Related Libraries (same author)
- HeadTTS (@met4citizen/headtts) — Free in-browser TTS with lip-sync timestamps
- HeadAudio (@met4citizen/headaudio) — Audio-driven viseme detection

## What Changes in the UI

### Before (current):
```
┌──────────────────────────┐
│  Emma CSS avatar (small)  │
│  ┌────────────────────┐  │
│  │ Chat messages       │  │
│  │ scrolling list      │  │
│  │ ...                 │  │
│  │ ...                 │  │
│  └────────────────────┘  │
│  [Type a message...]     │
└──────────────────────────┘
```

### After (new):
```
┌──────────────────────────┐
│                          │
│    ┌──────────────┐      │
│    │              │      │
│    │  Emma 3D     │      │
│    │  Avatar      │      │
│    │  (center)    │      │
│    │              │      │
│    └──────────────┘      │
│                          │
│  "Jake's birthday is in  │  ← subtitle style (auto-hide)
│   3 days..."             │
│                          │
│     [ Talk to Emma ]     │  ← big button (voice mode)
│                          │
│  or type below           │
│  [What's on your mind..] │  ← small text input
└──────────────────────────┘
```

### Key UI Principles:
1. Emma avatar takes up 60% of screen (hero position)
2. Text appears as SUBTITLES below avatar, not chat bubbles
3. Subtitles fade out after 5 seconds (configurable)
4. User can toggle subtitles on/off (accessibility)
5. "Talk to Emma" button is primary (voice-first)
6. Text input is secondary (smaller, below)
7. No chat history visible by default (this is a conversation, not a chat log)
8. Optional: small "Show transcript" button to see full conversation text

## Installation

```bash
npm install @met4citizen/talkinghead three
```

Or use CDN (no install needed):
```javascript
import { TalkingHead } from "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs";
```

## Avatar Model (GLB file)

Emma needs a 3D avatar model in GLB format with:
- Mixamo-compatible rig (skeleton)
- ARKit blend shapes (for facial expressions)
- Oculus viseme blend shapes (for lip-sync)

### Option A: Create custom Emma avatar
Use the Blender workflow in the TalkingHead repo (/blender folder).
Tim has Blender experience and an RTX 5090 — this is feasible.

### Option B: Use a pre-made avatar temporarily
TalkingHead ships with sample avatars in the /avatars folder.
Use one as a placeholder during development, replace later with custom Emma.

### Option C: Generate via AI
Use a service like Meshy.ai or similar to generate a 3D character,
then rig it in Blender following TalkingHead's Appendix A guide.

For beta, Option B (pre-made) is recommended. Custom Emma avatar for v2.

## Core Integration Code

### 1. Avatar Component (React)

Create: `components/EmmaAvatar.jsx`

```jsx
'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

export default function EmmaAvatar({ 
  onReady, 
  emotionData,
  subtitlesEnabled = true 
}) {
  const containerRef = useRef(null);
  const headRef = useRef(null);
  const [subtitle, setSubtitle] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const subtitleTimer = useRef(null);

  useEffect(() => {
    let head = null;
    
    async function initAvatar() {
      // Dynamic import to avoid SSR issues
      const { TalkingHead } = await import(
        'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs'
      );

      head = new TalkingHead(containerRef.current, {
        ttsEndpoint: null, // We handle TTS separately via Gemini
        cameraView: 'upper', // Show upper body
        cameraRotateEnable: false, // Don't let user rotate camera
        cameraZoomEnable: false,
        cameraPanEnable: false,
        avatarMood: 'neutral',
        avatarMute: true, // We control audio separately
        modelPixelRatio: 1, // Adjust for performance
        modelFPS: 30, // 30 FPS is smooth enough, saves battery
      });

      // Load Emma's avatar model
      await head.showAvatar(
        '/avatars/emma.glb', // Path to Emma's GLB model
        {
          body: 'F', // Female body type
          avatarMood: 'neutral',
          idleMotion: 'listening', // Default idle animation
        }
      );

      headRef.current = head;
      setIsLoaded(true);
      
      if (onReady) onReady(head);
    }

    initAvatar().catch(console.error);

    return () => {
      if (head) {
        head.dispose();
      }
    };
  }, []);

  // Update expression based on emotion data from emotion tracker
  useEffect(() => {
    if (!headRef.current || !emotionData) return;

    const { valence, arousal, dominant } = emotionData;

    // Map emotion to avatar mood
    if (valence > 0.5) {
      headRef.current.setMood('happy');
    } else if (valence > 0.2) {
      headRef.current.setMood('friendly');
    } else if (valence < -0.3) {
      headRef.current.setMood('sad');
    } else if (valence < -0.1) {
      headRef.current.setMood('concerned');
    } else {
      headRef.current.setMood('neutral');
    }

    // Add gesture for emphasis
    if (arousal > 0.7) {
      headRef.current.playGesture('nod');
    }
  }, [emotionData]);

  // Show subtitle with auto-hide
  const showSubtitle = useCallback((text) => {
    if (!subtitlesEnabled) return;
    setSubtitle(text);
    
    if (subtitleTimer.current) {
      clearTimeout(subtitleTimer.current);
    }
    subtitleTimer.current = setTimeout(() => {
      setSubtitle('');
    }, 8000); // Hide after 8 seconds
  }, [subtitlesEnabled]);

  // Expose methods for parent component
  useEffect(() => {
    if (headRef.current) {
      // Attach showSubtitle to the head instance for easy access
      headRef.current._showSubtitle = showSubtitle;
    }
  }, [isLoaded, showSubtitle]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100%',
      minHeight: '400px',
      background: '#FFFCF8',
    }}>
      {/* 3D Avatar Container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '400px',
        }}
      />

      {/* Loading state */}
      {!isLoaded && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#888',
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

      {/* Subtitle overlay */}
      {subtitle && (
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '85%',
          padding: '10px 20px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          borderRadius: 12,
          fontSize: 15,
          lineHeight: 1.5,
          textAlign: 'center',
          animation: 'fadeIn 0.3s ease',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
```

### 2. Updated Chat Page

Create or update: `app/chat/page.jsx`

```jsx
'use client';
import { useState, useRef, useCallback } from 'react';
import EmmaAvatar from '@/components/EmmaAvatar';

export default function ChatPage() {
  const headRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [subtitlesOn, setSubtitlesOn] = useState(true);

  const onAvatarReady = useCallback((head) => {
    headRef.current = head;
    
    // Emma's greeting animation
    head.playGesture('wave');
    
    // Load proactive greeting from memory engine
    loadGreeting();
  }, []);

  async function loadGreeting() {
    const res = await fetch('/api/chat/greeting', { method: 'POST' });
    const data = await res.json();
    
    if (data.greeting && headRef.current) {
      // Show greeting as subtitle
      headRef.current._showSubtitle(data.greeting);
      
      // If TTS audio is available, lip-sync it
      if (data.audio) {
        headRef.current.speakAudio(data.audio);
      }
    }
  }

  // Handle voice conversation
  async function startVoiceChat() {
    setIsListening(true);
    // Connect to Gemini Live API WebSocket
    // (existing implementation — just add emotion tracking)
    // On each AI response:
    //   1. Parse emotion: parseEmotionFromResponse(rawResponse)
    //   2. Update avatar: setCurrentEmotion(emotion)
    //   3. Show subtitle: headRef.current._showSubtitle(cleanText)
    //   4. Lip-sync: headRef.current.speakAudio(audioData)
    //   5. Save emotion: saveEmotionTurn(...)
  }

  function stopVoiceChat() {
    setIsListening(false);
    // Disconnect WebSocket
    // Process session end
  }

  // Handle text message
  async function sendTextMessage() {
    if (!textInput.trim()) return;

    const message = textInput;
    setTextInput('');
    setTranscript(prev => [...prev, { role: 'user', text: message }]);

    // Emma nods while "thinking"
    if (headRef.current) {
      headRef.current.setMood('thinking');
    }

    const res = await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    const data = await res.json();

    // Update emotion
    if (data.emotion) {
      setCurrentEmotion(data.emotion);
    }

    // Show response as subtitle
    if (headRef.current) {
      headRef.current._showSubtitle(data.response);
      
      // If TTS audio provided, lip-sync
      if (data.audio) {
        headRef.current.speakAudio(data.audio);
      }
    }

    setTranscript(prev => [...prev, { role: 'emma', text: data.response }]);
  }

  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#FFFCF8',
    }}>
      {/* Emma Avatar — hero area (60% of screen) */}
      <div style={{ flex: '1 1 60%', position: 'relative' }}>
        <EmmaAvatar
          onReady={onAvatarReady}
          emotionData={currentEmotion}
          subtitlesEnabled={subtitlesOn}
        />

        {/* Subtitle toggle */}
        <button
          onClick={() => setSubtitlesOn(!subtitlesOn)}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'rgba(0,0,0,0.3)', border: 'none',
            color: '#fff', borderRadius: 20, padding: '6px 12px',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          CC {subtitlesOn ? 'ON' : 'OFF'}
        </button>

        {/* Transcript toggle */}
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          style={{
            position: 'absolute', top: 12, left: 12,
            background: 'rgba(0,0,0,0.3)', border: 'none',
            color: '#fff', borderRadius: 20, padding: '6px 12px',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {showTranscript ? 'Hide' : 'Show'} transcript
        </button>
      </div>

      {/* Transcript panel (hidden by default) */}
      {showTranscript && (
        <div style={{
          maxHeight: '30vh', overflowY: 'auto',
          padding: '12px 16px', borderTop: '1px solid #eee',
          background: '#fff',
        }}>
          {transcript.map((msg, i) => (
            <div key={i} style={{
              padding: '6px 0',
              fontSize: 13,
              color: msg.role === 'emma' ? '#4A1B0C' : '#0C447C',
            }}>
              <strong>{msg.role === 'emma' ? 'Emma' : 'You'}:</strong> {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Controls — bottom area */}
      <div style={{
        padding: '12px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {/* Primary: Voice button */}
        <button
          onClick={isListening ? stopVoiceChat : startVoiceChat}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 28,
            border: 'none',
            background: isListening ? '#E24B4A' : '#F0997B',
            color: isListening ? '#fff' : '#4A1B0C',
            fontSize: 16,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isListening ? 'Stop talking' : 'Talk to Emma'}
        </button>

        {/* Secondary: Text input */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
            placeholder="or type here..."
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 20,
              border: '1px solid #ddd',
              background: '#FFF8F0',
              fontSize: 14,
              outline: 'none',
            }}
          />
          {textInput && (
            <button
              onClick={sendTextMessage}
              style={{
                padding: '10px 16px',
                borderRadius: 20,
                border: 'none',
                background: '#F0997B',
                color: '#4A1B0C',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Connecting Emotion Tracker to Avatar Expressions

The emotion tracker outputs these values per message:
- valence: -1.0 to 1.0 (negative to positive)
- arousal: 0.0 to 1.0 (calm to excited)
- dominant: string (e.g., "happy", "sad", "lonely", "proud")

Map these to TalkingHead moods and gestures:

| Emotion State | Avatar Mood | Gesture | When |
|---|---|---|---|
| Happy news (valence > 0.5) | happy | nod, smile | User shares good news |
| Warm/friendly (valence 0.2~0.5) | friendly | (none) | Normal positive conversation |
| Neutral (valence -0.1~0.2) | neutral | (none) | Default state |
| Concerned (valence -0.3~-0.1) | concerned | head_tilt | User seems a bit down |
| Sad (valence < -0.3) | sad | slow_nod | User shares difficult feelings |
| Thinking (processing) | thinking | (none) | While generating response |
| Greeting | happy | wave | Session start |
| Remembering | neutral | look_up | Recalling a past memory |

### TalkingHead Mood/Gesture Methods:
```javascript
head.setMood('happy');        // Changes default expression
head.playGesture('nod');      // One-time gesture animation
head.playGesture('wave');     // Wave hello
head.playGesture('head_tilt');// Tilt head (curiosity/concern)
```

Note: Available moods and gestures depend on the avatar model's blend shapes
and animations. Check the TalkingHead docs for the full list.

## Audio Lip-Sync Integration

### With Gemini Live API (current setup):
The Gemini Live API streams audio via WebSocket. To lip-sync:

```javascript
// Option A: Use HeadAudio for audio-driven viseme detection
import { HeadAudio } from '@met4citizen/headaudio';
const headAudio = new HeadAudio();

// Feed Gemini's audio stream to HeadAudio
// HeadAudio outputs viseme blend shapes in real-time
// Feed those to TalkingHead

// Option B: Use TalkingHead's built-in streaming
// If you can get word timestamps from the audio:
head.streamStart();
head.streamFlush({
  audio: audioChunk,        // ArrayBuffer of audio data  
  words: ["Hello", "Tim"],  // Words in this chunk
  wtimes: [0.0, 0.5],      // Word start times (seconds)
  wdurations: [0.4, 0.3],  // Word durations (seconds)
});
head.streamEnd();
```

### For text-only messages (no voice):
Use HeadTTS for free in-browser text-to-speech with lip-sync:

```javascript
import { HeadTTS } from '@met4citizen/headtts';
const headtts = new HeadTTS({
  endpoints: ['webgpu'],  // In-browser inference
  voices: ['af_bella'],    // Female voice
});

await headtts.connect();

headtts.onmessage = (message) => {
  if (message.type === 'audio') {
    head.speakAudio(message.data);
  }
};

// Convert text response to speech + lip-sync
headtts.speak("Jake's birthday is in 3 days!");
```

## Performance Considerations

- Set modelFPS to 30 (not 60) to save battery on mobile
- Use modelPixelRatio: 1 on mobile (higher on desktop)
- The GLB model should be < 5MB for fast loading
- Use Draco compression on the GLB file (TalkingHead v1.5+ supports it)
- Consider lazy loading: show CSS avatar first, swap to 3D after loaded
- Test on older phones (iPhone SE, Samsung A series) for performance baseline

## File Structure After Integration

```
app/
  chat/
    page.jsx          ← Updated: avatar-centric layout
components/
  EmmaAvatar.jsx      ← NEW: 3D avatar component
public/
  avatars/
    emma.glb          ← Emma's 3D model (GLB format)
  animations/
    (Mixamo FBX files for custom animations, optional)
```

## Implementation Order

1. Install talkinghead package or add CDN import
2. Create EmmaAvatar.jsx component
3. Place a placeholder GLB model in public/avatars/
4. Update chat page layout (avatar hero + subtitle + controls)
5. Connect emotion tracker → avatar mood/expression
6. Connect Gemini audio → lip-sync (HeadAudio or streaming)
7. Test on mobile devices
8. Create custom Emma GLB model (later, with Blender)

## Environment Variables
No new env vars needed. TalkingHead runs entirely client-side.

## Dependencies to Add
```json
{
  "@met4citizen/talkinghead": "^1.7",
  "three": "^0.180.0"
}
```
Or use CDN imports to avoid bundle size increase.
