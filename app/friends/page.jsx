'use client';

import { Suspense } from 'react';
import EmmaHome from '@/components/emma/EmmaHome';

export default function FriendsPage() {
  // userName is read from localStorage inside EmmaHome on mount
  // (JWT auth — token + user object stored in localStorage)
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#fdf8f4' }} />}>
      <EmmaHome />
    </Suspense>
  );
}
