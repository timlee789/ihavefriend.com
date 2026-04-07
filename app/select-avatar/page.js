'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SelectAvatarPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/chat?character=emma'); }, [router]);
  return null;
}
