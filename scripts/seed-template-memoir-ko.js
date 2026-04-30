#!/usr/bin/env node
/**
 * scripts/seed-template-memoir-ko.js
 *
 * Inserts (or updates) the `memoir-ko` row in book_template_definitions.
 * 9 chapters × ~5 questions each = 45 questions covering the user's
 * life story from childhood through what they want to leave behind.
 *
 * 🔥 Task 69: every chapter title, description, intro_prompt, question
 *   prompt, and hint now ships with all three languages (ko/en/es).
 *   Previously most entries were Korean-only, which leaked through to
 *   English/Spanish users when they viewed an existing memoir-ko book.
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
      description:  {
        ko: '가장 어렸을 때부터 떠오르는 풍경, 사람, 느낌.',
        en: 'The earliest scenes, people, and feelings you remember.',
        es: 'Las primeras escenas, personas y sentimientos que recuerdas.',
      },
      intro_prompt: {
        ko: '어린 시절은 우리 인생의 뿌리예요. 그 시절의 기억을 천천히 떠올려보세요.',
        en: 'Childhood is the root of who we become. Take your time and let memories surface.',
        es: 'La infancia es la raíz de quienes somos. Tómate tu tiempo y deja que los recuerdos vengan.',
      },
      questions: [
        {
          id: 'ch1-q1', order: 1,
          prompt: {
            ko: '가장 어렸을 때 기억나는 장면 하나를 떠올려보세요. 그곳이 어디였고, 누가 있었나요?',
            en: 'Bring to mind the earliest scene you can remember. Where were you, and who was with you?',
            es: 'Trae a tu mente la escena más antigua que recuerdas. ¿Dónde estabas y quién estaba contigo?',
          },
          hint: { ko: '장소, 사람, 그때 느낌', en: 'place, people, the feeling of that moment', es: 'lugar, personas, sensación de ese momento' },
          topics_to_cover: ['place', 'people', 'feeling'],
          estimated_minutes: 4, is_optional: false,
        },
        {
          id: 'ch1-q2', order: 2,
          prompt: {
            ko: '어렸을 때 살던 집이나 동네를 떠올려보세요. 어떤 모습이었나요?',
            en: 'Think back to the home or neighborhood you grew up in. What did it look like?',
            es: 'Piensa en la casa o el barrio donde creciste. ¿Cómo era?',
          },
          hint: { ko: '집의 구조, 동네 풍경, 이웃', en: 'rooms, streets, neighbors', es: 'habitaciones, calles, vecinos' },
          estimated_minutes: 4,
        },
        {
          id: 'ch1-q3', order: 3,
          prompt: {
            ko: '부모님과의 어린 시절 추억 중 가장 따뜻하게 남은 것은 무엇인가요?',
            en: 'What is the warmest memory you have of your parents from your early childhood?',
            es: '¿Cuál es el recuerdo más cálido que tienes de tus padres en tu infancia?',
          },
          estimated_minutes: 5,
        },
        {
          id: 'ch1-q4', order: 4,
          prompt: {
            ko: '형제자매가 있다면, 그들과의 어린 시절 추억을 들려주세요.',
            en: 'If you had brothers or sisters, share a memory of them from those years.',
            es: 'Si tuviste hermanos o hermanas, comparte un recuerdo de esos años.',
          },
          estimated_minutes: 4, is_optional: true,
        },
        {
          id: 'ch1-q5', order: 5,
          prompt: {
            ko: '어렸을 때 가장 좋아했던 것 또는 무서워했던 것이 있다면?',
            en: 'What did you most love or fear as a child?',
            es: '¿Qué amabas más o qué temías más cuando eras niño?',
          },
          estimated_minutes: 3,
        },
      ],
    },
    {
      id: 'ch2',
      order: 2,
      title:        { ko: '가족', en: 'Family', es: 'Familia' },
      description:  {
        ko: '나를 키워주신 분들과 가족의 이야기.',
        en: 'The people who raised you and shaped your family life.',
        es: 'Las personas que te criaron y formaron tu vida familiar.',
      },
      intro_prompt: {
        ko: '가족은 우리를 만든 사람들이에요. 그분들에 대한 기억을 들려주세요.',
        en: 'Family is who made us. Share what you remember of them.',
        es: 'La familia es quienes nos hicieron. Cuéntame lo que recuerdas de ellos.',
      },
      questions: [
        { id: 'ch2-q1', order: 1, prompt: { ko: '어머니에 대한 가장 또렷한 기억을 들려주세요.', en: 'Share the clearest memory you have of your mother.', es: 'Comparte el recuerdo más claro que tienes de tu madre.' }, estimated_minutes: 5 },
        { id: 'ch2-q2', order: 2, prompt: { ko: '아버지에 대한 가장 또렷한 기억을 들려주세요.', en: 'Share the clearest memory you have of your father.', es: 'Comparte el recuerdo más claro que tienes de tu padre.' }, estimated_minutes: 5 },
        { id: 'ch2-q3', order: 3, prompt: { ko: '가장 가까웠던 가족 한 명에 대해 들려주세요.', en: 'Tell me about the family member you were closest to.', es: 'Háblame del miembro de la familia con quien fuiste más cercano.' }, estimated_minutes: 4 },
        { id: 'ch2-q4', order: 4, prompt: { ko: '어른들로부터 배운 가르침 중 평생 남은 것은 무엇인가요?', en: 'What lesson from the elders in your life has stayed with you?', es: '¿Qué enseñanza de los mayores te ha quedado para toda la vida?' }, estimated_minutes: 4 },
        { id: 'ch2-q5', order: 5, prompt: { ko: '가족 명절이나 특별한 날 중 기억에 남는 장면이 있나요?', en: 'Is there a holiday or family gathering that comes back to you vividly?', es: '¿Hay una fiesta o reunión familiar que recuerdas con claridad?' }, estimated_minutes: 4 },
        { id: 'ch2-q6', order: 6, prompt: { ko: '가족과 함께 견딘 어려운 시기가 있다면 들려주세요.', en: 'Was there a hard time your family went through together? Share what you can.', es: '¿Hubo un tiempo difícil que tu familia atravesó junta? Comparte lo que puedas.' }, estimated_minutes: 5, is_optional: true },
      ],
    },
    {
      id: 'ch3',
      order: 3,
      title:        { ko: '학창 시절', en: 'School Years', es: 'Años de escuela' },
      description:  {
        ko: '학교, 친구, 선생님, 그 시절의 추억.',
        en: 'School, friends, teachers, and the texture of those years.',
        es: 'La escuela, los amigos, los maestros, y la textura de esos años.',
      },
      intro_prompt: {
        ko: '학창 시절의 풍경을 천천히 떠올려보세요.',
        en: 'Let the school years come back slowly — the classrooms, the faces.',
        es: 'Deja que los años de la escuela vuelvan despacio — las aulas, los rostros.',
      },
      questions: [
        { id: 'ch3-q1', order: 1, prompt: { ko: '가장 친했던 친구가 누구였나요? 어떻게 만나셨나요?', en: 'Who was your closest friend in school? How did you meet?', es: '¿Quién fue tu mejor amigo en la escuela? ¿Cómo se conocieron?' }, estimated_minutes: 5 },
        { id: 'ch3-q2', order: 2, prompt: { ko: '기억에 남는 선생님 한 분을 떠올려보세요.', en: 'Bring to mind a teacher you remember.', es: 'Trae a tu mente un maestro que recuerdas.' }, hint: { ko: '외모, 말투, 가르치던 모습', en: 'how they looked, how they spoke, how they taught', es: 'cómo se veía, cómo hablaba, cómo enseñaba' }, estimated_minutes: 4 },
        { id: 'ch3-q3', order: 3, prompt: { ko: '학교에서 가장 즐거웠던 일이 무엇이었나요?', en: 'What was the most fun you had at school?', es: '¿Qué fue lo más divertido que viviste en la escuela?' }, estimated_minutes: 4 },
        { id: 'ch3-q4', order: 4, prompt: { ko: '학창 시절 가장 자랑스러웠던 순간이 있다면?', en: 'Was there a moment in school you were especially proud of?', es: '¿Hubo un momento en la escuela del que estuviste especialmente orgulloso?' }, estimated_minutes: 4 },
        { id: 'ch3-q5', order: 5, prompt: { ko: '학창 시절 어려웠던 일이나 후회되는 일이 있다면?', en: 'Was there something hard or something you regret from those years?', es: '¿Hubo algo difícil o algo que lamentas de esos años?' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch4',
      order: 4,
      title:        { ko: '청년기 — 첫 사랑, 결혼', en: 'Young Love and Marriage', es: 'Amor y matrimonio' },
      description:  {
        ko: '사랑과 결혼의 이야기.',
        en: 'Stories of love, partnership, and the start of marriage.',
        es: 'Historias de amor, compañerismo y los inicios del matrimonio.',
      },
      intro_prompt: {
        ko: '젊은 시절 사랑과 결혼에 대한 이야기를 들려주세요.',
        en: 'Tell me about love and partnership in your younger years.',
        es: 'Háblame del amor y del compañerismo en tus años jóvenes.',
      },
      questions: [
        { id: 'ch4-q1', order: 1, prompt: { ko: '첫 사랑 또는 첫 데이트 이야기가 있다면 들려주세요.', en: 'If you have one, share a memory of your first love or first date.', es: 'Si la tienes, comparte un recuerdo de tu primer amor o primera cita.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch4-q2', order: 2, prompt: { ko: '배우자(또는 평생 동반자)와 처음 만난 이야기를 들려주세요.', en: 'How did you first meet your spouse or life partner?', es: '¿Cómo conociste a tu pareja de vida?' }, estimated_minutes: 5 },
        { id: 'ch4-q3', order: 3, prompt: { ko: '결혼하기까지의 과정은 어떠셨나요?', en: 'What was the road to getting married like?', es: '¿Cómo fue el camino hasta casarse?' }, estimated_minutes: 5 },
        { id: 'ch4-q4', order: 4, prompt: { ko: '결혼식 날 가장 기억에 남는 장면을 들려주세요.', en: 'Share the moment from your wedding day that stays with you most.', es: 'Comparte el momento del día de tu boda que más te queda.' }, estimated_minutes: 4 },
        { id: 'ch4-q5', order: 5, prompt: { ko: '신혼 시절 추억 중 잊지 못할 것을 들려주세요.', en: 'Tell me about the early years of your marriage — a memory you cannot forget.', es: 'Cuéntame un recuerdo inolvidable de los primeros años de matrimonio.' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch5',
      order: 5,
      title:        { ko: '일과 직업', en: 'Work and Career', es: 'Trabajo y profesión' },
      description:  {
        ko: '평생 해 오신 일과 직업의 여정.',
        en: 'The journey of the work you have done in your life.',
        es: 'El recorrido del trabajo que has hecho en tu vida.',
      },
      intro_prompt: {
        ko: '일을 하며 보낸 시간들을 떠올려보세요.',
        en: 'Think back over the years you spent working.',
        es: 'Mira hacia atrás los años que pasaste trabajando.',
      },
      questions: [
        { id: 'ch5-q1', order: 1, prompt: { ko: '첫 직장 이야기를 들려주세요. 어떻게 시작하셨나요?', en: 'Tell me about your first job. How did it begin?', es: 'Cuéntame de tu primer trabajo. ¿Cómo empezó?' }, estimated_minutes: 5 },
        { id: 'ch5-q2', order: 2, prompt: { ko: '일하면서 가장 자랑스러웠던 순간이 언제였나요?', en: 'What was the moment in your work you were most proud of?', es: '¿Cuál fue el momento de tu trabajo del que estuviste más orgulloso?' }, estimated_minutes: 5 },
        { id: 'ch5-q3', order: 3, prompt: { ko: '일하면서 가장 어려웠던 순간은 어떻게 견디셨나요?', en: 'How did you get through the hardest moment in your career?', es: '¿Cómo superaste el momento más difícil de tu carrera?' }, estimated_minutes: 5 },
        { id: 'ch5-q4', order: 4, prompt: { ko: '일을 통해 만난 멘토나 동료가 있다면 들려주세요.', en: 'Was there a mentor or colleague along the way who shaped you?', es: '¿Hubo un mentor o colega en el camino que te marcó?' }, estimated_minutes: 4 },
        { id: 'ch5-q5', order: 5, prompt: { ko: '은퇴 또는 직업을 바꾸셨다면 그 결정의 순간을 들려주세요.', en: 'If you retired or changed careers, share that turning point.', es: 'Si te jubilaste o cambiaste de carrera, comparte ese momento.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch5-q6', order: 6, prompt: { ko: '일을 통해 배운 인생 교훈이 있다면 무엇인가요?', en: 'What life lesson did your work teach you?', es: '¿Qué lección de vida te enseñó tu trabajo?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch6',
      order: 6,
      title:        { ko: '자녀 키우기', en: 'Raising Children', es: 'Criar a los hijos' },
      description:  {
        ko: '자녀와 함께한 시간들.',
        en: 'The years spent raising your children.',
        es: 'Los años criando a tus hijos.',
      },
      intro_prompt: {
        ko: '자녀를 키우며 지나온 시간을 떠올려보세요.',
        en: 'Think back over the years of raising your children.',
        es: 'Mira hacia atrás los años de criar a tus hijos.',
      },
      questions: [
        { id: 'ch6-q1', order: 1, prompt: { ko: '첫째 아이가 태어났을 때를 들려주세요.', en: 'Tell me about the day your first child was born.', es: 'Cuéntame el día en que nació tu primer hijo.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q2', order: 2, prompt: { ko: '자녀들 어렸을 때 가장 행복했던 추억은?', en: 'What was the happiest memory from when your children were young?', es: '¿Cuál fue el recuerdo más feliz de cuando tus hijos eran pequeños?' }, estimated_minutes: 5 },
        { id: 'ch6-q3', order: 3, prompt: { ko: '자녀와의 어려운 시기를 어떻게 보내셨나요?', en: 'How did you get through a hard time with your children?', es: '¿Cómo atravesaste un tiempo difícil con tus hijos?' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q4', order: 4, prompt: { ko: '자녀에 대해 가장 자랑스러웠던 순간을 들려주세요.', en: 'Share the moment you were most proud of one of your children.', es: 'Comparte el momento que estuviste más orgulloso de uno de tus hijos.' }, estimated_minutes: 4 },
        { id: 'ch6-q5', order: 5, prompt: { ko: '자녀에게 꼭 전하고 싶은 것이 있다면 무엇인가요?', en: 'What is the one thing you most want to pass on to your children?', es: '¿Qué es lo único que más quieres transmitir a tus hijos?' }, estimated_minutes: 5 },
        { id: 'ch6-q6', order: 6, prompt: { ko: '손주가 있다면, 손주에 대한 이야기를 들려주세요.', en: 'If you have grandchildren, tell me about them.', es: 'Si tienes nietos, háblame de ellos.' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch7',
      order: 7,
      title:        { ko: '신앙과 인생관', en: 'Faith and Beliefs', es: 'Fe y creencias' },
      description:  {
        ko: '삶을 지탱한 믿음과 가치관.',
        en: 'The beliefs and values that have carried you through life.',
        es: 'Las creencias y valores que te han sostenido en la vida.',
      },
      intro_prompt: {
        ko: '삶의 깊은 곳에 자리한 믿음과 가치관을 들려주세요.',
        en: 'Share the beliefs and values that live deep in your life.',
        es: 'Comparte las creencias y valores que viven en lo profundo de tu vida.',
      },
      questions: [
        { id: 'ch7-q1', order: 1, prompt: { ko: '신앙이 있으시다면, 신앙의 시작을 들려주세요.', en: 'If you have a faith, tell me how it began for you.', es: 'Si tienes una fe, cuéntame cómo comenzó para ti.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch7-q2', order: 2, prompt: { ko: '인생에서 가장 큰 깨달음의 순간이 있었나요?', en: 'Was there a moment of deep insight or realization in your life?', es: '¿Hubo un momento de profunda comprensión en tu vida?' }, estimated_minutes: 5 },
        { id: 'ch7-q3', order: 3, prompt: { ko: '어려운 시기를 어떻게 견디셨나요?', en: 'How did you carry yourself through the hardest seasons?', es: '¿Cómo te sostuviste en las temporadas más difíciles?' }, estimated_minutes: 5 },
        { id: 'ch7-q4', order: 4, prompt: { ko: '인생에서 가장 감사한 일은 무엇인가요?', en: 'What in your life are you most grateful for?', es: '¿Por qué de tu vida estás más agradecido?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch8',
      order: 8,
      title:        { ko: '인생의 큰 결정들', en: 'The Big Decisions', es: 'Las grandes decisiones' },
      description:  {
        ko: '인생 방향을 바꾼 결정의 순간들.',
        en: 'The choices that changed the direction of your life.',
        es: 'Las decisiones que cambiaron el rumbo de tu vida.',
      },
      intro_prompt: {
        ko: '지나온 인생을 돌아보며 큰 결정의 순간들을 떠올려보세요.',
        en: 'Look back over your life and bring up the big turning points.',
        es: 'Mira atrás y trae los grandes momentos que cambiaron el rumbo.',
      },
      questions: [
        { id: 'ch8-q1', order: 1, prompt: { ko: '인생에서 가장 큰 결정의 순간은 언제였나요?', en: 'What was the biggest decision of your life?', es: '¿Cuál fue la decisión más grande de tu vida?' }, estimated_minutes: 5 },
        { id: 'ch8-q2', order: 2, prompt: { ko: '당신 인생을 바꾼 만남이 있다면 들려주세요.', en: 'Was there an encounter that changed the direction of your life?', es: '¿Hubo un encuentro que cambió el rumbo de tu vida?' }, estimated_minutes: 5 },
        { id: 'ch8-q3', order: 3, prompt: { ko: '후회되는 결정이 있다면 솔직하게 들려주세요.', en: 'If there is a decision you regret, share it honestly.', es: 'Si hay una decisión que lamentas, compártela honestamente.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch8-q4', order: 4, prompt: { ko: '다시 돌아가도 똑같이 할 결정이 있다면 무엇인가요?', en: 'What is one decision you would make again exactly the same way?', es: '¿Qué decisión tomarías otra vez exactamente igual?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch9',
      order: 9,
      title:        { ko: '남기고 싶은 것', en: 'What I Want to Leave Behind', es: 'Lo que quiero dejar' },
      description:  {
        ko: '후세에 전하고 싶은 마음.',
        en: 'The things you most want to pass on.',
        es: 'Lo que más quieres transmitir.',
      },
      intro_prompt: {
        ko: '마지막 챕터예요. 남기고 싶은 마음을 천천히 들려주세요.',
        en: 'This is the last chapter. Take your time, and tell me what you most want to leave behind.',
        es: 'Este es el último capítulo. Tómate tu tiempo y cuéntame lo que más quieres dejar.',
      },
      questions: [
        { id: 'ch9-q1', order: 1, prompt: { ko: '자녀와 손주에게 꼭 하고 싶은 말이 있다면?', en: 'What do you most want to say to your children and grandchildren?', es: '¿Qué es lo que más quieres decir a tus hijos y nietos?' }, estimated_minutes: 5 },
        { id: 'ch9-q2', order: 2, prompt: { ko: '인생에서 배운 가장 큰 교훈은 무엇인가요?', en: 'What is the greatest lesson your life has taught you?', es: '¿Cuál es la lección más grande que te ha enseñado la vida?' }, estimated_minutes: 5 },
        { id: 'ch9-q3', order: 3, prompt: { ko: '우리 가족만의 가풍이나 전통이 있다면 들려주세요.', en: 'Is there a tradition or way of being that runs through your family?', es: '¿Hay una tradición o forma de ser que recorre a tu familia?' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch9-q4', order: 4, prompt: { ko: '사람들이 당신을 어떻게 기억해주면 좋을까요?', en: 'How would you most like to be remembered?', es: '¿Cómo te gustaría más ser recordado?' }, estimated_minutes: 5 },
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
      ${JSON.stringify({ ko: '내 인생을 9개 챕터로 정리하는 자서전', en: 'Your life story in 9 chapters.', es: 'La historia de tu vida en 9 capítulos.' })}::jsonb,
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

  console.log(`✅ memoir-ko seeded — ${totalChapters} chapters, ${totalQuestions} questions (full ko/en/es)`);
})().catch(e => { console.error(e); process.exit(1); });
