'use client';
import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwaClient';

// Registers the Service Worker on every page load (silent, no UI)
export default function PWAInit() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
