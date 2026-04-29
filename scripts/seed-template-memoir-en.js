#!/usr/bin/env node
/**
 * scripts/seed-template-memoir-en.js
 *
 * English-language memoir template (45 questions × 9 chapters).
 * Mirrors memoir-ko structurally; senior-friendly, gentle tone.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-template-memoir-en.js
 */

const { neon } = require('@neondatabase/serverless');

const MEMOIR_EN_STRUCTURE = {
  chapters: [
    {
      id: 'ch1',
      order: 1,
      title:        { en: 'Childhood', ko: '어린 시절', es: 'Infancia' },
      description:  { en: 'The earliest scenes, people, and feelings you remember.' },
      intro_prompt: { en: 'Childhood is the root of who we become. Take your time and let memories surface.' },
      questions: [
        { id: 'ch1-q1', order: 1, prompt: { en: 'Bring to mind the earliest scene you can remember. Where were you, and who was with you?' }, hint: { en: 'place, people, the feeling of that moment' }, topics_to_cover: ['place', 'people', 'feeling'], estimated_minutes: 4, is_optional: false },
        { id: 'ch1-q2', order: 2, prompt: { en: 'Think back to the home or neighborhood you grew up in. What did it look like?' }, hint: { en: 'rooms, streets, neighbors' }, estimated_minutes: 4 },
        { id: 'ch1-q3', order: 3, prompt: { en: 'What is the warmest memory you have of your parents from your early childhood?' }, estimated_minutes: 5 },
        { id: 'ch1-q4', order: 4, prompt: { en: 'If you had brothers or sisters, share a memory of them from those years.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch1-q5', order: 5, prompt: { en: 'What did you most love or fear as a child?' }, estimated_minutes: 3 },
      ],
    },
    {
      id: 'ch2',
      order: 2,
      title:        { en: 'Family', ko: '가족' },
      description:  { en: 'The people who raised you and shaped your family life.' },
      intro_prompt: { en: 'Family is who made us. Share what you remember of them.' },
      questions: [
        { id: 'ch2-q1', order: 1, prompt: { en: 'Share the clearest memory you have of your mother.' }, estimated_minutes: 5 },
        { id: 'ch2-q2', order: 2, prompt: { en: 'Share the clearest memory you have of your father.' }, estimated_minutes: 5 },
        { id: 'ch2-q3', order: 3, prompt: { en: 'Tell me about the family member you were closest to.' }, estimated_minutes: 4 },
        { id: 'ch2-q4', order: 4, prompt: { en: 'What lesson from the elders in your life has stayed with you?' }, estimated_minutes: 4 },
        { id: 'ch2-q5', order: 5, prompt: { en: 'Is there a holiday or family gathering that comes back to you vividly?' }, estimated_minutes: 4 },
        { id: 'ch2-q6', order: 6, prompt: { en: 'Was there a hard time your family went through together? Share what you can.' }, estimated_minutes: 5, is_optional: true },
      ],
    },
    {
      id: 'ch3',
      order: 3,
      title:        { en: 'School Years' },
      description:  { en: 'School, friends, teachers, and the texture of those years.' },
      intro_prompt: { en: 'Let the school years come back slowly — the classrooms, the faces.' },
      questions: [
        { id: 'ch3-q1', order: 1, prompt: { en: 'Who was your closest friend in school? How did you meet?' }, estimated_minutes: 5 },
        { id: 'ch3-q2', order: 2, prompt: { en: 'Bring to mind a teacher you remember.' }, hint: { en: 'how they looked, how they spoke, how they taught' }, estimated_minutes: 4 },
        { id: 'ch3-q3', order: 3, prompt: { en: 'What was the most fun you had at school?' }, estimated_minutes: 4 },
        { id: 'ch3-q4', order: 4, prompt: { en: 'Was there a moment in school you were especially proud of?' }, estimated_minutes: 4 },
        { id: 'ch3-q5', order: 5, prompt: { en: 'Was there something hard or something you regret from those years?' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch4',
      order: 4,
      title:        { en: 'Young Love and Marriage' },
      description:  { en: 'Stories of love, partnership, and the start of marriage.' },
      intro_prompt: { en: 'Tell me about love and partnership in your younger years.' },
      questions: [
        { id: 'ch4-q1', order: 1, prompt: { en: 'If you have one, share a memory of your first love or first date.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch4-q2', order: 2, prompt: { en: 'How did you first meet your spouse or life partner?' }, estimated_minutes: 5 },
        { id: 'ch4-q3', order: 3, prompt: { en: 'What was the road to getting married like?' }, estimated_minutes: 5 },
        { id: 'ch4-q4', order: 4, prompt: { en: 'Share the moment from your wedding day that stays with you most.' }, estimated_minutes: 4 },
        { id: 'ch4-q5', order: 5, prompt: { en: 'Tell me about the early years of your marriage — a memory you cannot forget.' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch5',
      order: 5,
      title:        { en: 'Work and Career' },
      description:  { en: 'The journey of the work you have done in your life.' },
      intro_prompt: { en: 'Think back over the years you spent working.' },
      questions: [
        { id: 'ch5-q1', order: 1, prompt: { en: 'Tell me about your first job. How did it begin?' }, estimated_minutes: 5 },
        { id: 'ch5-q2', order: 2, prompt: { en: 'What was the moment in your work you were most proud of?' }, estimated_minutes: 5 },
        { id: 'ch5-q3', order: 3, prompt: { en: 'How did you get through the hardest moment in your career?' }, estimated_minutes: 5 },
        { id: 'ch5-q4', order: 4, prompt: { en: 'Was there a mentor or colleague along the way who shaped you?' }, estimated_minutes: 4 },
        { id: 'ch5-q5', order: 5, prompt: { en: 'If you retired or changed careers, share that turning point.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch5-q6', order: 6, prompt: { en: 'What life lesson did your work teach you?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch6',
      order: 6,
      title:        { en: 'Raising Children' },
      description:  { en: 'The years spent raising your children.' },
      intro_prompt: { en: 'Think back over the years of raising your children.' },
      questions: [
        { id: 'ch6-q1', order: 1, prompt: { en: 'Tell me about the day your first child was born.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q2', order: 2, prompt: { en: 'What was the happiest memory from when your children were young?' }, estimated_minutes: 5 },
        { id: 'ch6-q3', order: 3, prompt: { en: 'How did you get through a hard time with your children?' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q4', order: 4, prompt: { en: 'Share the moment you were most proud of one of your children.' }, estimated_minutes: 4 },
        { id: 'ch6-q5', order: 5, prompt: { en: 'What is the one thing you most want to pass on to your children?' }, estimated_minutes: 5 },
        { id: 'ch6-q6', order: 6, prompt: { en: 'If you have grandchildren, tell me about them.' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch7',
      order: 7,
      title:        { en: 'Faith and Beliefs' },
      description:  { en: 'The beliefs and values that have carried you through life.' },
      intro_prompt: { en: 'Share the beliefs and values that live deep in your life.' },
      questions: [
        { id: 'ch7-q1', order: 1, prompt: { en: 'If you have a faith, tell me how it began for you.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch7-q2', order: 2, prompt: { en: 'Was there a moment of deep insight or realization in your life?' }, estimated_minutes: 5 },
        { id: 'ch7-q3', order: 3, prompt: { en: 'How did you carry yourself through the hardest seasons?' }, estimated_minutes: 5 },
        { id: 'ch7-q4', order: 4, prompt: { en: 'What in your life are you most grateful for?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch8',
      order: 8,
      title:        { en: 'The Big Decisions' },
      description:  { en: 'The choices that changed the direction of your life.' },
      intro_prompt: { en: 'Look back over your life and bring up the big turning points.' },
      questions: [
        { id: 'ch8-q1', order: 1, prompt: { en: 'What was the biggest decision of your life?' }, estimated_minutes: 5 },
        { id: 'ch8-q2', order: 2, prompt: { en: 'Was there an encounter that changed the direction of your life?' }, estimated_minutes: 5 },
        { id: 'ch8-q3', order: 3, prompt: { en: 'If there is a decision you regret, share it honestly.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch8-q4', order: 4, prompt: { en: 'What is one decision you would make again exactly the same way?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch9',
      order: 9,
      title:        { en: 'What I Want to Leave Behind' },
      description:  { en: 'The things you most want to pass on.' },
      intro_prompt: { en: 'This is the last chapter. Take your time, and tell me what you most want to leave behind.' },
      questions: [
        { id: 'ch9-q1', order: 1, prompt: { en: 'What do you most want to say to your children and grandchildren?' }, estimated_minutes: 5 },
        { id: 'ch9-q2', order: 2, prompt: { en: 'What is the greatest lesson your life has taught you?' }, estimated_minutes: 5 },
        { id: 'ch9-q3', order: 3, prompt: { en: 'Is there a tradition or way of being that runs through your family?' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch9-q4', order: 4, prompt: { en: 'How would you most like to be remembered?' }, estimated_minutes: 5 },
      ],
    },
  ],
};

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  const totalQuestions = MEMOIR_EN_STRUCTURE.chapters.reduce((s, c) => s + c.questions.length, 0);
  const totalChapters  = MEMOIR_EN_STRUCTURE.chapters.length;

  await sql`
    INSERT INTO book_template_definitions (
      id, name, description, category, language, default_structure,
      estimated_chapters, estimated_questions, estimated_pages, estimated_days,
      is_active, is_premium, sort_order
    ) VALUES (
      'memoir-en',
      ${JSON.stringify({ en: 'My Memoir', ko: '내 자서전', es: 'Mis memorias' })}::jsonb,
      ${JSON.stringify({ en: 'Your life story in 9 chapters.' })}::jsonb,
      'memoir',
      'en',
      ${JSON.stringify(MEMOIR_EN_STRUCTURE)}::jsonb,
      ${totalChapters}, ${totalQuestions}, 120, 90,
      true, false, 2
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

  console.log(`✅ memoir-en seeded — ${totalChapters} chapters, ${totalQuestions} questions`);
})().catch(e => { console.error(e); process.exit(1); });
