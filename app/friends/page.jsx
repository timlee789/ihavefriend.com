'use client';

/**
 * /friends — Deprecated (2026-04-26 / Task 38)
 *
 * The old /friends route hosted EmmaHome (companion-style identity).
 * Identity has shifted: SayAndKeep is a story-collection tool, not an AI friend.
 * This page now silently redirects to / (the new identity-first home).
 *
 * EmmaHome.jsx is preserved (unused) under /components/emma for reference.
 * Old bookmarks and any lingering router.push('/friends') calls land here
 * and get bounced to /.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FriendsPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}
