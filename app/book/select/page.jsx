'use client';

/**
 * /book/select — legacy route (Task 71).
 *
 * Originally moved to /book/templates. After Architect Bot V2 (2026-05-09)
 * /book/templates was removed, so this redirect now points at /architect
 * (the new entry into the memoir flow). Kept as a thin client-side
 * redirect so any external bookmark / shared link from before keeps working.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BookSelectRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/architect'); }, [router]);
  return null;
}
