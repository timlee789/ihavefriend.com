'use client';
import { RuntimeLoader } from '@rive-app/react-canvas';

// Set local WASM URL before ANY Rive component mounts.
// Putting this in layout.jsx ensures it runs once globally,
// before EmmaRive.jsx mounts and before HMR can interfere.
RuntimeLoader.setWasmUrl('/rive.wasm');

export default function RiveInit() {
  return null;
}
