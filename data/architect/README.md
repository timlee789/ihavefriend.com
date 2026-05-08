# Architect Bot — Library Data

> SayAndKeep 의 Architect Bot 이 사용하는 챕터/질문 라이브러리.
> Tim 의 admin UI + 사용자 UI 에서 추가/수정/삭제 가능.

## 파일 구조

```
data/architect/
├── chapter-library-ko.json   — 한국어 챕터 라이브러리 (45개)
├── question-library-ko.json  — 한국어 질문 라이브러리 (75개)
└── README.md                  — 이 파일
```

## 디자인 원칙

### 영감 트리거 (Inspiration Spark)

라이브러리는 **정답 매칭이 아닌 영감 제공이 목적**.

- 사용자가 막막할 때 방향 제시
- 사용자가 보고 "아, 나는 이렇게 하면 좋겠다" 라는 생각 유도
- 사용자가 자기 식으로 수정해서 채택

### 작은 규모 (의도적)

너무 많은 선택지 = 결정 마비 (잼 실험 — Sheena Iyengar).
적당한 다양성 = 영감 + 결정.

- 챕터 45 (기본 7 + 다양성 38)
- 질문 75 (8 카테고리 × 평균 9-10)

### 살아있는 데이터

- Tim 이 admin UI 에서 추가/수정/삭제
- 사용자가 자기 청사진에서 추가/수정/삭제
- 베타 사용자 피드백 반영해 계속 진화
- 지금 완벽할 필요 없음

## 챕터 라이브러리 (chapter-library-ko.json)

### 기본 7개 (is_general: true)

모든 사용자에게 디폴트로 제시되는 일반 목차.

| ID | 제목 | Category |
|---|---|---|
| ch-001 | 어린 시절 | childhood |
| ch-002 | 청년기 | youth |
| ch-003 | 결혼과 가정 | marriage |
| ch-004 | 일과 사업 | work |
| ch-005 | 자녀 키우기 | children |
| ch-006 | 인생의 큰 결정들 | legacy |
| ch-007 | 남기고 싶은 것 | legacy |

### 다양성 38개 (is_general: false)

사용자 키워드에 따라 tag + category 매칭으로 추출.

카테고리별 분포:
- childhood: 7 (ch-008~014)
- youth: 5 (ch-015~019)
- marriage: 5 (ch-020, 023, 024) + children 2 (ch-021, 022)
- work: 5 (ch-025~029)
- immigration: 3 (ch-030~032)
- faith: 4 (ch-033~036)
- relationships: 5 (ch-037~041)
- legacy: 4 (ch-042~045)

### Schema

```typescript
interface Chapter {
  id: string;             // 'ch-001', 'ch-002'
  title: string;          // '어린 시절'
  description: string;    // 사용자에게 보여줄 설명
  category: string;       // 'childhood', 'youth', 'marriage', ...
  tags: string[];         // 5-10 영감 키워드
  is_general: boolean;    // 일반 목차 (기본 7)
  sort_order: number;
}
```

## 질문 라이브러리 (question-library-ko.json)

### 카테고리별 분포

| Category | Count | Question Range |
|---|---|---|
| childhood | 12 | q-001 ~ q-012 |
| youth | 10 | q-013 ~ q-022 |
| marriage | 9 | q-023 ~ q-031 |
| work | 9 | q-032 ~ q-040 |
| children | 9 | q-041 ~ q-049 |
| immigration | 8 | q-050 ~ q-057 |
| faith | 8 | q-058 ~ q-065 |
| legacy | 10 | q-066 ~ q-075 |

### Schema

```typescript
interface Question {
  id: string;             // 'q-001'
  question_text: string;  // '어머니에 대한 한 장면'
  description: string;    // 사용자에게 보여줄 hint
  category: string;       // 챕터와 동일한 enum
  tags: string[];         // 3-5 매칭 키워드
}
```

## 매칭 알고리즘 (예정)

사용자 발화에서 키워드 추출 → 라이브러리 매칭:

```
사용자: "어렸을 때 시골에서 자랐어"

1. Gemini 2.5 Flash 로 키워드 추출:
   ["시골", "어린", "자란"]

2. 챕터 매칭 (tag 우선 + category 보강):
   SELECT * FROM chapter_library
   WHERE tags && ARRAY['시골', '어린', '자란']
      OR (tags 매칭 부족 시) category = 'childhood'
   ORDER BY tag 매칭 개수 DESC
   LIMIT 5;
   
3. 사용자에게 5 후보 제시

4. 질문 매칭 (선택된 챕터의 category + chapter tags):
   SELECT * FROM question_library
   WHERE category = chapter.category
      OR tags && chapter.tags
   ORDER BY 매칭 점수 DESC
   LIMIT 7;
```

## 사용 흐름 (Architect Bot)

1. 사용자 가입 → /architect
2. Bot: 기본 7 챕터 제시 (`is_general: true`)
3. 사용자가 키워드로 응답
4. Bot: 라이브러리에서 5-7 후보 추출 → 제시
5. 사용자: 선택 / 수정 / 거부 / 자기 추가
6. 채택된 챕터 → user_chapters DB
7. 챕터 max_chapters (default 7) 까지 반복
8. 챕터 완료 후 → 각 챕터에 질문 만들기
9. 질문도 같은 방식 (제시 → 선택/수정 → 채택)
10. 청사진 완성 → /chat 으로 답변 시작

## 변경 / 추가 / 삭제

### Tim 의 admin UI (Phase 5+)

```
/admin/architect/chapters
  - 모든 챕터 list
  - 추가 / 수정 / 삭제
  - tag, category, sort_order 관리

/admin/architect/questions
  - 모든 질문 list
  - 추가 / 수정 / 삭제
```

### 사용자 UI (Phase 1)

```
/architect/blueprint
  - 사용자 자기 청사진에서 자유 변경
  - 라이브러리 의 챕터 import 가능
  - 사용자 자기 챕터 직접 추가 가능
```

## 다음 작업

1. ✅ 챕터 라이브러리 JSON (45개)
2. ✅ 질문 라이브러리 JSON (75개)
3. ⏳ DB schema migration (Prisma)
4. ⏳ Seed script (JSON → DB)
5. ⏳ Bot 매칭 API
6. ⏳ /architect UI

## 관련 문서

- [STRATEGY-architect-bot-final-2026-05-07.md](../../obsidian/...)
- [DAILY-2026-05-07-architect-bot-final-design.md](../../obsidian/...)
