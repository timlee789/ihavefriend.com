'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // If already logged in → go to Emma Home, otherwise → login
    const token = localStorage.getItem('token');
    const user  = localStorage.getItem('user');
    if (token && user) {
      router.replace('/friends');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return null;
}
