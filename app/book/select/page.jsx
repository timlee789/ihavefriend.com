'use client';

/**
 * /book/select — legacy route (Task 71).
 *
 * The page moved to /book/templates. Kept as a thin client-side
 * redirect so any external bookmark / shared link from before the
 * rename keeps working.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BookSelectRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/book/templates'); }, [router]);
  return null;
}
