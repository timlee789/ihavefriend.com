'use client';

import { Suspense } from 'react';
import EmmaChat from '@/components/emma/EmmaChat';

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#fdf8f4' }} />}>
      <EmmaChat />
    </Suspense>
  );
}
