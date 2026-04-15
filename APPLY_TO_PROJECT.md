# Emma Home UI 업데이트 적용 지시서

## 이번에 변경된 것
- CTA 버튼 "Emma와 대화하기" 를 낮/밤 모드 모두 주황색(#ea580c)으로 통일
- 버튼 hover 시: 색이 약간 진해지고 위로 1px 올라오는 효과 + 그림자 강해짐
- 버튼 active(클릭) 시: 살짝 눌리는 scale 효과

## 적용할 파일

### 1) `components/emma/EmmaHome.module.css` 전체 교체
다운로드된 `ihavefriend-emma-ui/components/emma/EmmaHome.module.css` 로 현재 파일을 교체해주세요.

핵심 변경 부분만 보면:

```css
/* DAY 버튼 */
.day .ctaBtn {
  background: #ea580c;
  box-shadow: 0 4px 16px rgba(234,88,12,0.28);
}
.day .ctaBtn:hover {
  opacity: 1;
  background: #c94d0a;
  box-shadow: 0 6px 20px rgba(234,88,12,0.38);
}

/* NIGHT 버튼 — 기존 보라색에서 주황색으로 변경 */
.night .ctaBtn {
  background: #ea580c;
  box-shadow: 0 4px 20px rgba(234,88,12,0.35);
}
.night .ctaBtn:hover {
  opacity: 1;
  background: #c94d0a;
  box-shadow: 0 6px 24px rgba(234,88,12,0.45);
}

/* 공통 transition */
.ctaBtn {
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.1s ease;
}
.ctaBtn:hover  { transform: translateY(-1px); }
.ctaBtn:active { transform: scale(0.98); }
```

### 2) 다른 파일은 변경 없음
- `EmmaHome.jsx` — 변경 없음
- `EmmaAvatar.jsx` — 변경 없음
- `EmmaChat.jsx` / `EmmaChat.module.css` — 변경 없음
- `app/friends/page.jsx` / `app/chat/page.jsx` — 변경 없음

## 확인 방법
적용 후 `/friends` 페이지에서:
1. 낮 모드: 주황 버튼 보임 → hover 시 진한 주황 + 위로 뜨는 효과
2. 밤 모드 전환: 버튼 여전히 주황색 (보라색 아님)
3. 버튼 클릭: 살짝 눌리는 느낌
