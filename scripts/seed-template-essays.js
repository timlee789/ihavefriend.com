#!/usr/bin/env node
/**
 * scripts/seed-template-essays.js  (Task 71)
 *
 * Essay-style book template — looser, theme-based structure than the
 * memoir. 6 themes × ~5 prompts each. Senior-friendly tone.
 *
 * Inserts three rows: essays-ko / essays-en / essays-es. Each row
 * carries the same fully tri-lingual default_structure; the only
 * difference is the `language` column (used by /api/book/templates
 * to filter what the user sees on /book/templates).
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-template-essays.js
 */
const { neon } = require('@neondatabase/serverless');

const ESSAYS_STRUCTURE = {
  chapters: [
    {
      id: 'ch1',
      order: 1,
      title:        { ko: '오늘의 마음', en: "Today's Heart", es: 'Mi corazón hoy' },
      description:  {
        ko: '지금 이 순간 떠오르는 생각, 감정, 풍경.',
        en: 'Thoughts, feelings, and scenes from this very moment.',
        es: 'Pensamientos, sentimientos y escenas de este momento.',
      },
      intro_prompt: {
        ko: '지금 이 순간 마음에 떠오르는 것을 자유롭게 들려주세요.',
        en: 'Share whatever is on your mind right now, freely.',
        es: 'Comparte libremente lo que tienes en mente ahora mismo.',
      },
      questions: [
        { id: 'ch1-q1', order: 1, prompt: { ko: '오늘 가장 인상 깊었던 순간은 무엇인가요?', en: "What's the most striking moment from today?", es: '¿Cuál fue el momento más impactante de hoy?' }, estimated_minutes: 4 },
        { id: 'ch1-q2', order: 2, prompt: { ko: '요즘 자주 떠오르는 사람이 있나요?', en: "Is there someone who's been on your mind lately?", es: '¿Hay alguien que tienes en mente últimamente?' }, estimated_minutes: 4 },
        { id: 'ch1-q3', order: 3, prompt: { ko: '오늘 발견한 작은 기쁨 하나를 들려주세요.', en: 'Tell me about a small joy you found today.', es: 'Cuéntame una pequeña alegría que encontraste hoy.' }, estimated_minutes: 3 },
        { id: 'ch1-q4', order: 4, prompt: { ko: '지금 마음에 무거운 것이 있다면 들려주세요.', en: 'If something is weighing on you, share it.', es: 'Si algo te está pesando, compártelo.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch1-q5', order: 5, prompt: { ko: '이번 주에 감사한 일이 있다면?', en: 'Anything you are grateful for this week?', es: '¿Algo que agradeces de esta semana?' }, estimated_minutes: 3 },
      ],
    },
    {
      id: 'ch2',
      order: 2,
      title:        { ko: '계절과 풍경', en: 'Seasons and Scenery', es: 'Estaciones y paisajes' },
      description:  {
        ko: '계절의 변화와 마음에 남은 풍경.',
        en: 'The turn of seasons and scenes that stay with you.',
        es: 'El paso de las estaciones y los paisajes que te quedan.',
      },
      intro_prompt: {
        ko: '계절의 변화 속에서 떠오르는 풍경을 들려주세요.',
        en: 'Share scenes that come to you with the changing seasons.',
        es: 'Comparte escenas que vienen con el cambio de estaciones.',
      },
      questions: [
        { id: 'ch2-q1', order: 1, prompt: { ko: '가장 좋아하는 계절과 그 이유를 들려주세요.', en: 'Tell me your favorite season and why.', es: 'Cuéntame tu estación favorita y por qué.' }, estimated_minutes: 4 },
        { id: 'ch2-q2', order: 2, prompt: { ko: '잊을 수 없는 풍경 하나를 떠올려보세요.', en: 'Bring to mind one scene you cannot forget.', es: 'Trae a tu mente una escena que no puedes olvidar.' }, estimated_minutes: 5 },
        { id: 'ch2-q3', order: 3, prompt: { ko: '비 오는 날 떠오르는 기억이 있나요?', en: 'Any memory that comes back on rainy days?', es: '¿Algún recuerdo que vuelve en días lluviosos?' }, estimated_minutes: 4 },
        { id: 'ch2-q4', order: 4, prompt: { ko: '여행에서 본 풍경 중 잊지 못할 것을 들려주세요.', en: 'A scene from a trip you cannot forget.', es: 'Una escena de un viaje que no puedes olvidar.' }, estimated_minutes: 5, is_optional: true },
      ],
    },
    {
      id: 'ch3',
      order: 3,
      title:        { ko: '책과 음악', en: 'Books and Music', es: 'Libros y música' },
      description:  {
        ko: '읽은 책, 들은 음악, 그것들이 남긴 자국.',
        en: 'Books read, music heard, the marks they left.',
        es: 'Libros leídos, música escuchada, las marcas que dejaron.',
      },
      intro_prompt: {
        ko: '당신을 만든 책과 음악에 대해 들려주세요.',
        en: 'Tell me about the books and music that shaped you.',
        es: 'Háblame de los libros y la música que te formaron.',
      },
      questions: [
        { id: 'ch3-q1', order: 1, prompt: { ko: '인생에서 가장 큰 영향을 준 책은 무엇인가요?', en: 'What book has influenced you the most?', es: '¿Qué libro te ha influenciado más?' }, estimated_minutes: 5 },
        { id: 'ch3-q2', order: 2, prompt: { ko: '들으면 마음이 평온해지는 음악이 있나요?', en: 'Is there music that brings you peace?', es: '¿Hay música que te trae paz?' }, estimated_minutes: 4 },
        { id: 'ch3-q3', order: 3, prompt: { ko: '특정 음악이나 노래에 얽힌 추억이 있다면?', en: 'A memory tied to a particular song or piece?', es: '¿Un recuerdo ligado a una canción o pieza?' }, estimated_minutes: 5 },
        { id: 'ch3-q4', order: 4, prompt: { ko: '최근에 읽고 좋았던 책이나 본 영화는?', en: 'A recent book or film you enjoyed?', es: '¿Un libro o película reciente que te gustó?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch4',
      order: 4,
      title:        { ko: '사람과 관계', en: 'People and Relationships', es: 'Personas y relaciones' },
      description:  {
        ko: '내 주변 사람들, 관계의 풍경.',
        en: 'The people around you, the shape of your relationships.',
        es: 'Las personas a tu alrededor, la forma de tus relaciones.',
      },
      intro_prompt: {
        ko: '당신 곁의 사람들에 대한 이야기를 들려주세요.',
        en: 'Tell me about the people in your life.',
        es: 'Cuéntame sobre las personas en tu vida.',
      },
      questions: [
        { id: 'ch4-q1', order: 1, prompt: { ko: '오랜 친구 한 명에 대해 들려주세요.', en: 'Tell me about an old friend.', es: 'Háblame de un viejo amigo.' }, estimated_minutes: 5 },
        { id: 'ch4-q2', order: 2, prompt: { ko: '최근 만난 사람 중 인상 깊었던 분이 있나요?', en: 'Anyone you met recently who left an impression?', es: '¿Alguien que conociste recientemente que dejó huella?' }, estimated_minutes: 4 },
        { id: 'ch4-q3', order: 3, prompt: { ko: '당신을 가장 잘 이해해주는 사람은 누구인가요?', en: 'Who understands you best?', es: '¿Quién te entiende mejor?' }, estimated_minutes: 4 },
        { id: 'ch4-q4', order: 4, prompt: { ko: '관계에서 배운 인생 교훈이 있다면?', en: 'A life lesson you learned from a relationship?', es: '¿Una lección de vida aprendida de una relación?' }, estimated_minutes: 5 },
      ],
    },
    {
      id: 'ch5',
      order: 5,
      title:        { ko: '일과 취미', en: 'Work and Hobbies', es: 'Trabajo y aficiones' },
      description:  {
        ko: '일하는 시간과 자유로운 시간의 풍경.',
        en: 'The texture of working time and free time.',
        es: 'La textura del tiempo de trabajo y del tiempo libre.',
      },
      intro_prompt: {
        ko: '하루의 시간을 어떻게 보내고 계신가요?',
        en: 'How do you spend the hours of your day?',
        es: '¿Cómo pasas las horas de tu día?',
      },
      questions: [
        { id: 'ch5-q1', order: 1, prompt: { ko: '요즘 가장 몰입하는 일은 무엇인가요?', en: 'What absorbs you most these days?', es: '¿Qué te absorbe más estos días?' }, estimated_minutes: 5 },
        { id: 'ch5-q2', order: 2, prompt: { ko: '즐기는 취미가 있다면 들려주세요.', en: 'Share a hobby you enjoy.', es: 'Comparte una afición que disfrutas.' }, estimated_minutes: 4 },
        { id: 'ch5-q3', order: 3, prompt: { ko: '일을 하면서 가장 보람을 느끼는 순간은?', en: 'When does work feel most meaningful?', es: '¿Cuándo se siente más significativo el trabajo?' }, estimated_minutes: 4 },
        { id: 'ch5-q4', order: 4, prompt: { ko: '시간이 더 있다면 무엇을 해보고 싶으세요?', en: 'What would you do if you had more time?', es: '¿Qué harías si tuvieras más tiempo?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch6',
      order: 6,
      title:        { ko: '자유로운 생각', en: 'Open Thoughts', es: 'Pensamientos libres' },
      description:  {
        ko: '주제 없이 떠오르는 대로 쓰는 글.',
        en: 'Free writing — whatever comes, no theme required.',
        es: 'Escritura libre — lo que venga, sin tema.',
      },
      intro_prompt: {
        ko: '특정 주제 없이 자유롭게 이야기하는 자리예요.',
        en: 'A space to talk freely, with no fixed topic.',
        es: 'Un espacio para hablar libremente, sin tema fijo.',
      },
      questions: [
        { id: 'ch6-q1', order: 1, prompt: { ko: '요즘 자주 생각하는 주제가 있나요?', en: 'Is there a topic you keep thinking about?', es: '¿Hay un tema en el que sigues pensando?' }, estimated_minutes: 5 },
        { id: 'ch6-q2', order: 2, prompt: { ko: '나이가 들면서 새롭게 보이는 것이 있다면?', en: 'Something you see differently as you grow older?', es: '¿Algo que ves diferente al hacerte mayor?' }, estimated_minutes: 5 },
        { id: 'ch6-q3', order: 3, prompt: { ko: '한 단어로 지금 마음을 표현한다면?', en: 'One word to describe how you feel right now?', es: '¿Una palabra para describir cómo te sientes?' }, estimated_minutes: 3 },
        { id: 'ch6-q4', order: 4, prompt: { ko: '아무에게도 말하지 않은 생각이 있다면 (들려주실 수 있을 만큼만)?', en: "A thought you've shared with no one (only as much as you'd like)?", es: 'Un pensamiento que no has compartido (solo lo que quieras)?' }, estimated_minutes: 5, is_optional: true },
      ],
    },
  ],
};

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  const totalQuestions = ESSAYS_STRUCTURE.chapters
    .reduce((s, c) => s + c.questions.length, 0);
  const totalChapters  = ESSAYS_STRUCTURE.chapters.length;

  for (const variant of [
    { id: 'essays-ko', lang: 'ko', sort: 4 },
    { id: 'essays-en', lang: 'en', sort: 5 },
    { id: 'essays-es', lang: 'es', sort: 6 },
  ]) {
    await sql`
      INSERT INTO book_template_definitions (
        id, name, description, category, language, default_structure,
        estimated_chapters, estimated_questions, estimated_pages, estimated_days,
        is_active, is_premium, sort_order
      ) VALUES (
        ${variant.id},
        ${JSON.stringify({ ko: '수필집', en: 'Essay Collection', es: 'Colección de ensayos' })}::jsonb,
        ${JSON.stringify({ ko: '자유로운 형식의 짧은 글 모음', en: 'A free-form collection of short essays', es: 'Una colección libre de ensayos cortos' })}::jsonb,
        'essays',
        ${variant.lang},
        ${JSON.stringify(ESSAYS_STRUCTURE)}::jsonb,
        ${totalChapters}, ${totalQuestions}, 60, 45,
        true, false, ${variant.sort}
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
    console.log(`  ✅ ${variant.id} (${variant.lang}) seeded`);
  }

  console.log(`✅ essays-ko/en/es seeded — ${totalChapters} chapters, ${totalQuestions} questions`);
})().catch(e => { console.error(e); process.exit(1); });
