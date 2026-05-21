'use client';

/**
 * lib/hooks/useMediaQuery.js
 *
 * CSS media query 매칭을 React state 로 추적하는 훅.
 * Visual Tree 의 모바일 가독성 분기에 사용 (Step 1g).
 *
 * SSR 안전 — 초기값 false. 클라이언트 mount 후 실제 값으로 동기화.
 * matchMedia change 이벤트 listen 하여 viewport 회전/resize 대응.
 *
 * 사용:
 *   const isMobile = useMediaQuery('(max-width: 768px)');
 *   // 또는
 *   const isMobile = useIsMobile();
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e) => setMatches(e.matches);
    // 구형 브라우저 호환 (addListener) 도 fallback
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 768px)');
}
