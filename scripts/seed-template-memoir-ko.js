#!/usr/bin/env node
/**
 * scripts/seed-template-memoir-ko.js
 *
 * Inserts (or updates) the `memoir-ko` row in book_template_definitions.
 * 9 chapters × ~5 questions each = 45 questions covering the user's
 * life story from childhood through what they want to leave behind.
 *
 * Idempotent: ON CONFLICT (id) DO UPDATE refreshes default_structure
 * and estimated_questions so re-running picks up edits to this file.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-template-memoir-ko.js
 */

const { neon } = require('@neondatabase/serverless');

const MEMOIR_KO_STRUCTURE = {
  chapters: [
    {
      id: 'ch1',
      order: 1,
      title:        { ko: '어린 시절', en: 'Childhood', es: 'Infancia' },
      description:  { ko: '가장 어렸을 때부터 떠오르는 풍경, 사람, 느낌.' },
      intro_prompt: { ko: '어린 시절은 우리 인생의 뿌리예요. 그 시절의 기억을 천천히 떠올려보세요.' },
      questions: [
        { id: 'ch1-q1', order: 1, prompt: { ko: '가장 어렸을 때 기억나는 장면 하나를 떠올려보세요. 그곳이 어디였고, 누가 있었나요?' }, hint: { ko: '장소, 사람, 그때 느낌' }, topics_to_cover: ['place', 'people', 'feeling'], estimated_minutes: 4, is_optional: false },
        { id: 'ch1-q2', order: 2, prompt: { ko: '어렸을 때 살던 집이나 동네를 떠올려보세요. 어떤 모습이었나요?' }, hint: { ko: '집의 구조, 동네 풍경, 이웃' }, estimated_minutes: 4 },
        { id: 'ch1-q3', order: 3, prompt: { ko: '부모님과의 어린 시절 추억 중 가장 따뜻하게 남은 것은 무엇인가요?' }, estimated_minutes: 5 },
        { id: 'ch1-q4', order: 4, prompt: { ko: '형제자매가 있다면, 그들과의 어린 시절 추억을 들려주세요.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch1-q5', order: 5, prompt: { ko: '어렸을 때 가장 좋아했던 것 또는 무서워했던 것이 있다면?' }, estimated_minutes: 3 },
      ],
    },
    {
      id: 'ch2',
      order: 2,
      title:        { ko: '가족', en: 'Family' },
      description:  { ko: '나를 키워주신 분들과 가족의 이야기.' },
      intro_prompt: { ko: '가족은 우리를 만든 사람들이에요. 그분들에 대한 기억을 들려주세요.' },
      questions: [
        { id: 'ch2-q1', order: 1, prompt: { ko: '어머니에 대한 가장 또렷한 기억을 들려주세요.' }, estimated_minutes: 5 },
        { id: 'ch2-q2', order: 2, prompt: { ko: '아버지에 대한 가장 또렷한 기억을 들려주세요.' }, estimated_minutes: 5 },
        { id: 'ch2-q3', order: 3, prompt: { ko: '가장 가까웠던 가족 한 명에 대해 들려주세요.' }, estimated_minutes: 4 },
        { id: 'ch2-q4', order: 4, prompt: { ko: '어른들로부터 배운 가르침 중 평생 남은 것은 무엇인가요?' }, estimated_minutes: 4 },
        { id: 'ch2-q5', order: 5, prompt: { ko: '가족 명절이나 특별한 날 중 기억에 남는 장면이 있나요?' }, estimated_minutes: 4 },
        { id: 'ch2-q6', order: 6, prompt: { ko: '가족과 함께 견딘 어려운 시기가 있다면 들려주세요.' }, estimated_minutes: 5, is_optional: true },
      ],
    },
    {
      id: 'ch3',
      order: 3,
      title:        { ko: '학창 시절' },
      description:  { ko: '학교, 친구, 선생님, 그 시절의 추억.' },
      intro_prompt: { ko: '학창 시절의 풍경을 천천히 떠올려보세요.' },
      questions: [
        { id: 'ch3-q1', order: 1, prompt: { ko: '가장 친했던 친구가 누구였나요? 어떻게 만나셨나요?' }, estimated_minutes: 5 },
        { id: 'ch3-q2', order: 2, prompt: { ko: '기억에 남는 선생님 한 분을 떠올려보세요.' }, hint: { ko: '외모, 말투, 가르치던 모습' }, estimated_minutes: 4 },
        { id: 'ch3-q3', order: 3, prompt: { ko: '학교에서 가장 즐거웠던 일이 무엇이었나요?' }, estimated_minutes: 4 },
        { id: 'ch3-q4', order: 4, prompt: { ko: '학창 시절 가장 자랑스러웠던 순간이 있다면?' }, estimated_minutes: 4 },
        { id: 'ch3-q5', order: 5, prompt: { ko: '학창 시절 어려웠던 일이나 후회되는 일이 있다면?' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch4',
      order: 4,
      title:        { ko: '청년기 — 첫 사랑, 결혼' },
      description:  { ko: '사랑과 결혼의 이야기.' },
      intro_prompt: { ko: '젊은 시절 사랑과 결혼에 대한 이야기를 들려주세요.' },
      questions: [
        { id: 'ch4-q1', order: 1, prompt: { ko: '첫 사랑 또는 첫 데이트 이야기가 있다면 들려주세요.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch4-q2', order: 2, prompt: { ko: '배우자(또는 평생 동반자)와 처음 만난 이야기를 들려주세요.' }, estimated_minutes: 5 },
        { id: 'ch4-q3', order: 3, prompt: { ko: '결혼하기까지의 과정은 어떠셨나요?' }, estimated_minutes: 5 },
        { id: 'ch4-q4', order: 4, prompt: { ko: '결혼식 날 가장 기억에 남는 장면을 들려주세요.' }, estimated_minutes: 4 },
        { id: 'ch4-q5', order: 5, prompt: { ko: '신혼 시절 추억 중 잊지 못할 것을 들려주세요.' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch5',
      order: 5,
      title:        { ko: '일과 직업' },
      description:  { ko: '평생 해 오신 일과 직업의 여정.' },
      intro_prompt: { ko: '일을 하며 보낸 시간들을 떠올려보세요.' },
      questions: [
        { id: 'ch5-q1', order: 1, prompt: { ko: '첫 직장 이야기를 들려주세요. 어떻게 시작하셨나요?' }, estimated_minutes: 5 },
        { id: 'ch5-q2', order: 2, prompt: { ko: '일하면서 가장 자랑스러웠던 순간이 언제였나요?' }, estimated_minutes: 5 },
        { id: 'ch5-q3', order: 3, prompt: { ko: '일하면서 가장 어려웠던 순간은 어떻게 견디셨나요?' }, estimated_minutes: 5 },
        { id: 'ch5-q4', order: 4, prompt: { ko: '일을 통해 만난 멘토나 동료가 있다면 들려주세요.' }, estimated_minutes: 4 },
        { id: 'ch5-q5', order: 5, prompt: { ko: '은퇴 또는 직업을 바꾸셨다면 그 결정의 순간을 들려주세요.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch5-q6', order: 6, prompt: { ko: '일을 통해 배운 인생 교훈이 있다면 무엇인가요?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch6',
      order: 6,
      title:        { ko: '자녀 키우기' },
      description:  { ko: '자녀와 함께한 시간들.' },
      intro_prompt: { ko: '자녀를 키우며 지나온 시간을 떠올려보세요.' },
      questions: [
        { id: 'ch6-q1', order: 1, prompt: { ko: '첫째 아이가 태어났을 때를 들려주세요.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q2', order: 2, prompt: { ko: '자녀들 어렸을 때 가장 행복했던 추억은?' }, estimated_minutes: 5 },
        { id: 'ch6-q3', order: 3, prompt: { ko: '자녀와의 어려운 시기를 어떻게 보내셨나요?' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q4', order: 4, prompt: { ko: '자녀에 대해 가장 자랑스러웠던 순간을 들려주세요.' }, estimated_minutes: 4 },
        { id: 'ch6-q5', order: 5, prompt: { ko: '자녀에게 꼭 전하고 싶은 것이 있다면 무엇인가요?' }, estimated_minutes: 5 },
        { id: 'ch6-q6', order: 6, prompt: { ko: '손주가 있다면, 손주에 대한 이야기를 들려주세요.' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch7',
      order: 7,
      title:        { ko: '신앙과 인생관' },
      description:  { ko: '삶을 지탱한 믿음과 가치관.' },
      intro_prompt: { ko: '삶의 깊은 곳에 자리한 믿음과 가치관을 들려주세요.' },
      questions: [
        { id: 'ch7-q1', order: 1, prompt: { ko: '신앙이 있으시다면, 신앙의 시작을 들려주세요.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch7-q2', order: 2, prompt: { ko: '인생에서 가장 큰 깨달음의 순간이 있었나요?' }, estimated_minutes: 5 },
        { id: 'ch7-q3', order: 3, prompt: { ko: '어려운 시기를 어떻게 견디셨나요?' }, estimated_minutes: 5 },
        { id: 'ch7-q4', order: 4, prompt: { ko: '인생에서 가장 감사한 일은 무엇인가요?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch8',
      order: 8,
      title:        { ko: '인생의 큰 결정들' },
      description:  { ko: '인생 방향을 바꾼 결정의 순간들.' },
      intro_prompt: { ko: '지나온 인생을 돌아보며 큰 결정의 순간들을 떠올려보세요.' },
      questions: [
        { id: 'ch8-q1', order: 1, prompt: { ko: '인생에서 가장 큰 결정의 순간은 언제였나요?' }, estimated_minutes: 5 },
        { id: 'ch8-q2', order: 2, prompt: { ko: '당신 인생을 바꾼 만남이 있다면 들려주세요.' }, estimated_minutes: 5 },
        { id: 'ch8-q3', order: 3, prompt: { ko: '후회되는 결정이 있다면 솔직하게 들려주세요.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch8-q4', order: 4, prompt: { ko: '다시 돌아가도 똑같이 할 결정이 있다면 무엇인가요?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch9',
      order: 9,
      title:        { ko: '남기고 싶은 것' },
      description:  { ko: '후세에 전하고 싶은 마음.' },
      intro_prompt: { ko: '마지막 챕터예요. 남기고 싶은 마음을 천천히 들려주세요.' },
      questions: [
        { id: 'ch9-q1', order: 1, prompt: { ko: '자녀와 손주에게 꼭 하고 싶은 말이 있다면?' }, estimated_minutes: 5 },
        { id: 'ch9-q2', order: 2, prompt: { ko: '인생에서 배운 가장 큰 교훈은 무엇인가요?' }, estimated_minutes: 5 },
        { id: 'ch9-q3', order: 3, prompt: { ko: '우리 가족만의 가풍이나 전통이 있다면 들려주세요.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch9-q4', order: 4, prompt: { ko: '사람들이 당신을 어떻게 기억해주면 좋을까요?' }, estimated_minutes: 5 },
      ],
    },
  ],
};

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  const totalQuestions = MEMOIR_KO_STRUCTURE.chapters
    .reduce((sum, ch) => sum + ch.questions.length, 0);
  const totalChapters = MEMOIR_KO_STRUCTURE.chapters.length;

  await sql`
    INSERT INTO book_template_definitions (
      id, name, description, category, language, default_structure,
      estimated_chapters, estimated_questions, estimated_pages, estimated_days,
      is_active, is_premium, sort_order
    ) VALUES (
      'memoir-ko',
      ${JSON.stringify({ ko: '내 자서전', en: 'My Memoir', es: 'Mis memorias' })}::jsonb,
      ${JSON.stringify({ ko: '내 인생을 9개 챕터로 정리하는 자서전' })}::jsonb,
      'memoir',
      'ko',
      ${JSON.stringify(MEMOIR_KO_STRUCTURE)}::jsonb,
      ${totalChapters}, ${totalQuestions}, 120, 90,
      true, false, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      default_structure   = EXCLUDED.default_structure,
      estimated_questions = EXCLUDED.estimated_questions,
      estimated_chapters  = EXCLUDED.estimated_chapters,
      name                = EXCLUDED.name,
      description         = EXCLUDED.description,
      language            = EXCLUDED.language,
      updated_at          = NOW()
  `;

  console.log(`✅ memoir-ko seeded — ${totalChapters} chapters, ${totalQuestions} questions`);
})().catch(e => { console.error(e); process.exit(1); });
