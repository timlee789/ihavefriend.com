# SayAndKeep — Responsive Design System

> **Sprint 2L** (2026-05-11) — 영구 baseline. 모든 향후 페이지 + 베타
> 후 Tier 3 페이지가 이 system 위에 build.

---

## 1. Tim 의 4 결정 (영구 기록, 2026-05-11)

| # | 결정 | 선택 | 이유 |
|---|------|------|------|
| 1 | Sprint 분할 | **Hybrid** (Design system + Tier 1 페이지) | 영구 baseline 먼저, 그 위에 편집 페이지 |
| 2 | Desktop layout | **B — 진짜 desktop (sidebar/grid)** | 단순 max-width 확장이 아닌 PC UX |
| 3 | Tablet | **B — Tablet = Desktop 축소 (768px+)** | Tablet 만의 layout 은 over-engineering |
| 4 | 순서 | **A — Design system 먼저** | 모든 sprint 일관성 + 베타 후 빠른 적용 |

---

## 2. 영구 design 원칙

### Mobile-first + Desktop extension

```
Mobile (0-767px)   = primary. 시니어 음성 사용. 모든 페이지의 base.
Tablet (768-1023)  = Desktop pattern 의 축소. 따로 작업 X.
Desktop (1024+)    = extension. 편집/수정 친화 layer.
Wide (1440+)       = max-width 제한 (선택).
```

새 페이지는 항상 **mobile first** 작성 → `@media (min-width: var(--bp-tablet))` 로 desktop layer 추가. Mobile CSS 는 변경 안 함 (회귀 위험 0).

### Tablet = Desktop 축소

768px 이상은 desktop pattern 의 비례 축소. Tablet 만의 layout 없음 — 작업 50% 절약 + 일관성 ↑. 베타 검증 후 필요하면 추가.

---

## 3. CSS variables (`app/globals.css` 의 `:root`)

### Breakpoints

```css
--bp-tablet:  768px;
--bp-desktop: 1024px;
--bp-wide:    1440px;
```

미디어 쿼리 사용:
```css
@media (min-width: 768px) {
  /* desktop 시작 (tablet 포함) */
}
@media (min-width: 1024px) {
  /* full desktop */
}
@media (min-width: 1440px) {
  /* wide */
}
```

CSS variables 자체는 미디어 쿼리에 직접 안 들어가지만 코멘트 / JS 측 reference 로 활용.

### Max-width tokens

| Token | px | 사용처 (6 patterns) |
|-------|-----|---------------------|
| `--max-mobile`  | 430 | Pattern 1 (Centered Card) — Home, Login |
| `--max-reading` | 720 | Pattern 2 (Reading) — Terms, /architect |
| `--max-edit`    | 960 | Pattern 3 (Edit single column) |
| `--max-content` | 1200 | Pattern 4/5/6 (Edit sidebar + main, Grid, Hero) |
| `--max-wide`    | 1440 | 매우 넓은 콘텐츠 |

### Spacing scale

```css
--space-xs:   4px;   /* Tight: badge dot, icon spacing */
--space-sm:   8px;   /* Card gap */
--space-md:  16px;   /* Default padding */
--space-lg:  24px;   /* Section gap */
--space-xl:  32px;   /* Desktop section gap */
--space-2xl: 48px;   /* Hero block */
--space-3xl: 64px;   /* Page hero */
```

### Typography scale

```css
--text-xs:   12px;   /* Footer, meta, badge */
--text-sm:   14px;   /* Body small */
--text-base: 16px;   /* Body default */
--text-lg:   18px;   /* Sub-heading */
--text-xl:   22px;   /* H2 mobile */
--text-2xl:  28px;   /* Hero tagline */
--text-3xl:  36px;   /* H1 desktop */
```

### Sidebar widths (Pattern 4 전용)

```css
--sidebar-narrow: 260px;  /* TOC chapter list */
--sidebar-medium: 320px;  /* 표준 sidebar */
--sidebar-wide:   380px;  /* Photo gallery */
```

---

## 4. 6 Layout Patterns

### Pattern 1 — Centered Card

```
Mobile:  max-width: var(--max-mobile)   /* 430px */
Desktop: 같음 (카드 + 회색 배경)
```

사용처: Home (`/`), Login, Pricing (mobile view).

### Pattern 2 — Reading (긴 텍스트)

```
Mobile:  max-width: 100%, padding: var(--space-md)
Desktop: max-width: var(--max-reading) /* 720px */
         padding: var(--space-xl)
```

사용처: Terms, `/architect` (긴 6단계 안내).

### Pattern 3 — Edit Single-Column

```
Mobile:  max-width: 100%, padding: var(--space-md)
Desktop: max-width: var(--max-edit)     /* 960px */
         padding: var(--space-xl)
```

사용처: 단순 편집 페이지 (sidebar 불필요).

### Pattern 4 — Edit Sidebar + Main

```
Mobile:  Single column, stacked (sidebar collapse 또는 위로 이동)
Desktop:
  display: grid;
  grid-template-columns: var(--sidebar-medium) 1fr;
  gap: var(--space-xl);
  max-width: var(--max-content);
```

사용처 (Sprint 2M/2N):
- `/my-stories/[fragmentId]` — main: textarea / sidebar: photos
- `/my-stories/customize` — sidebar: chapter list / main: questions
- `/book/[id]` — sidebar: chapter list / main: chapter content
- `/book/[id]/customize` — sidebar: chapter list / main: questions
- `/chat` — sidebar: history / main: current chat (Tim 결정 대기)

### Pattern 5 — Grid (목록)

```
Mobile:  1 column
Tablet:  2 columns
Desktop: 3 columns
Wide:    4 columns
```

사용처: `/my-stories`, `/photobook`.

### Pattern 6 — Two-Column Hero (Home, 선택)

```
Mobile:  Stacked (hero card + 3 buttons)
Desktop:
  grid-template-columns: 1fr 1fr;
  /* Hero left, buttons right — 또는 wider stacked */
```

사용처: Home (`/`) — Sprint 2O 에서 옵션 A vs B Tim 결정.

---

## 5. 작업 순서 (4 sprints)

| Sprint | 작업 | 시간 |
|--------|------|------|
| **2L** (이번) | Design system foundation: CSS variables + 패턴 문서 + utility | 3 시간 |
| **2M** | Tier 1 편집 — `/my-stories/[fragmentId]` + `/my-stories/customize` + `/my-stories` | 3 시간 |
| **2N** | Tier 1 편집 — `/book/[id]` + `/book/[id]/customize` + `/chat` | 3 시간 |
| **2O** | Tier 2 polish — Home + `/pricing` + `/architect` + `/login` | 1-2 시간 |

총 10-12 시간 / 1.5 주. 베타 발송 (Phase 3) 직전 마무리.

---

## 6. 회귀 안전 규칙

1. **Mobile CSS 변경 X** — `@media (min-width: 768px)` 안에서만 desktop CSS 추가.
2. **각 sprint 후 mobile 검증** — Sprint 1~2k 의 모든 기능 작동 확인.
3. **Backend / DB / API 변경 X** — UI 만.
4. **`@media` 외 다른 곳에서 새 variables 적용 시 mobile 영향 ↑** — 주의.

---

## 7. 사용 예시

### 새 페이지의 page.module.css 패턴

```css
/* Mobile-first base (현재 패턴) */
.container {
  max-width: var(--max-mobile);
  margin: 0 auto;
  padding: var(--space-md);
}

/* Desktop layer (Pattern 4: Edit Sidebar + Main) */
@media (min-width: 768px) {
  .container {
    max-width: var(--max-content);
    padding: var(--space-xl);
    display: grid;
    grid-template-columns: var(--sidebar-medium) 1fr;
    gap: var(--space-xl);
  }
}
```

또는 `app/util.module.css` 의 utility class 활용:

```jsx
import s from './page.module.css';
import u from '@/app/util.module.css';

<div className={`${u.containerEdit} ${s.pageBody}`}>
  …
</div>
```

---

## 8. Tim 결정 대기

- 🟡 `/chat` 의 desktop layout (Pattern 4 vs Mobile 그대로) — Sprint 2N 시작 시.
- 🟡 Home 의 desktop layout (옵션 A 단순 vs B 2-column hero) — Sprint 2O 시작 시.

---

## 9. 영구 학습

> **"Mobile first + Desktop extension"** — 모든 페이지의 baseline.

> **"Tablet = Desktop 축소"** — Over-engineering 회피.

> **"Design system = 영구 자산"** — Tier 3 페이지 + 베타 후 + NovaAiStudio 미래 product.

---

## 관련 문서

- `STRATEGY-responsive-design-2026-05-11.md` — 본 sprint 의 source.
- `DAILY-2026-05-11-sprint-2k-pricing-page.md` — 직전 sprint.
