#!/usr/bin/env node
/**
 * scripts/seed-template-memoir-es.js
 *
 * Spanish-language memoir template (45 questions × 9 chapters).
 * Mirrors memoir-ko/en structurally with a warm, gentle tone aimed
 * at senior beta users.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/seed-template-memoir-es.js
 */

const { neon } = require('@neondatabase/serverless');

const MEMOIR_ES_STRUCTURE = {
  chapters: [
    {
      id: 'ch1',
      order: 1,
      title:        { es: 'Infancia', ko: '어린 시절', en: 'Childhood' },
      description:  { es: 'Las primeras escenas, personas y sentimientos que recuerdas.' },
      intro_prompt: { es: 'La infancia es la raíz de quienes somos. Tómate tu tiempo y deja que los recuerdos vengan.' },
      questions: [
        { id: 'ch1-q1', order: 1, prompt: { es: 'Trae a tu mente la escena más antigua que recuerdas. ¿Dónde estabas y quién estaba contigo?' }, hint: { es: 'lugar, personas, sensación de ese momento' }, topics_to_cover: ['place', 'people', 'feeling'], estimated_minutes: 4 },
        { id: 'ch1-q2', order: 2, prompt: { es: 'Piensa en la casa o el barrio donde creciste. ¿Cómo era?' }, hint: { es: 'habitaciones, calles, vecinos' }, estimated_minutes: 4 },
        { id: 'ch1-q3', order: 3, prompt: { es: '¿Cuál es el recuerdo más cálido que tienes de tus padres en tu infancia?' }, estimated_minutes: 5 },
        { id: 'ch1-q4', order: 4, prompt: { es: 'Si tuviste hermanos o hermanas, comparte un recuerdo de esos años.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch1-q5', order: 5, prompt: { es: '¿Qué amabas más o qué temías más cuando eras niño?' }, estimated_minutes: 3 },
      ],
    },
    {
      id: 'ch2',
      order: 2,
      title:        { es: 'Familia', ko: '가족', en: 'Family' },
      description:  { es: 'Las personas que te criaron y formaron tu vida familiar.' },
      intro_prompt: { es: 'La familia es quienes nos hicieron. Cuéntame lo que recuerdas de ellos.' },
      questions: [
        { id: 'ch2-q1', order: 1, prompt: { es: 'Comparte el recuerdo más claro que tienes de tu madre.' }, estimated_minutes: 5 },
        { id: 'ch2-q2', order: 2, prompt: { es: 'Comparte el recuerdo más claro que tienes de tu padre.' }, estimated_minutes: 5 },
        { id: 'ch2-q3', order: 3, prompt: { es: 'Háblame del miembro de la familia con quien fuiste más cercano.' }, estimated_minutes: 4 },
        { id: 'ch2-q4', order: 4, prompt: { es: '¿Qué enseñanza de los mayores te ha quedado para toda la vida?' }, estimated_minutes: 4 },
        { id: 'ch2-q5', order: 5, prompt: { es: '¿Hay una fiesta o reunión familiar que recuerdas con claridad?' }, estimated_minutes: 4 },
        { id: 'ch2-q6', order: 6, prompt: { es: '¿Hubo un tiempo difícil que tu familia atravesó junta? Comparte lo que puedas.' }, estimated_minutes: 5, is_optional: true },
      ],
    },
    {
      id: 'ch3',
      order: 3,
      title:        { es: 'Años de escuela' },
      description:  { es: 'La escuela, los amigos, los maestros, y la textura de esos años.' },
      intro_prompt: { es: 'Deja que los años de la escuela vuelvan despacio — las aulas, los rostros.' },
      questions: [
        { id: 'ch3-q1', order: 1, prompt: { es: '¿Quién fue tu mejor amigo en la escuela? ¿Cómo se conocieron?' }, estimated_minutes: 5 },
        { id: 'ch3-q2', order: 2, prompt: { es: 'Trae a tu mente un maestro que recuerdas.' }, hint: { es: 'cómo se veía, cómo hablaba, cómo enseñaba' }, estimated_minutes: 4 },
        { id: 'ch3-q3', order: 3, prompt: { es: '¿Qué fue lo más divertido que viviste en la escuela?' }, estimated_minutes: 4 },
        { id: 'ch3-q4', order: 4, prompt: { es: '¿Hubo un momento en la escuela del que estuviste especialmente orgulloso?' }, estimated_minutes: 4 },
        { id: 'ch3-q5', order: 5, prompt: { es: '¿Hubo algo difícil o algo que lamentas de esos años?' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch4',
      order: 4,
      title:        { es: 'Amor y matrimonio' },
      description:  { es: 'Historias de amor, compañerismo y los inicios del matrimonio.' },
      intro_prompt: { es: 'Háblame del amor y del compañerismo en tus años jóvenes.' },
      questions: [
        { id: 'ch4-q1', order: 1, prompt: { es: 'Si la tienes, comparte un recuerdo de tu primer amor o primera cita.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch4-q2', order: 2, prompt: { es: '¿Cómo conociste a tu pareja de vida?' }, estimated_minutes: 5 },
        { id: 'ch4-q3', order: 3, prompt: { es: '¿Cómo fue el camino hasta casarse?' }, estimated_minutes: 5 },
        { id: 'ch4-q4', order: 4, prompt: { es: 'Comparte el momento del día de tu boda que más te queda.' }, estimated_minutes: 4 },
        { id: 'ch4-q5', order: 5, prompt: { es: 'Cuéntame un recuerdo inolvidable de los primeros años de matrimonio.' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch5',
      order: 5,
      title:        { es: 'Trabajo y profesión' },
      description:  { es: 'El recorrido del trabajo que has hecho en tu vida.' },
      intro_prompt: { es: 'Mira hacia atrás los años que pasaste trabajando.' },
      questions: [
        { id: 'ch5-q1', order: 1, prompt: { es: 'Cuéntame de tu primer trabajo. ¿Cómo empezó?' }, estimated_minutes: 5 },
        { id: 'ch5-q2', order: 2, prompt: { es: '¿Cuál fue el momento de tu trabajo del que estuviste más orgulloso?' }, estimated_minutes: 5 },
        { id: 'ch5-q3', order: 3, prompt: { es: '¿Cómo superaste el momento más difícil de tu carrera?' }, estimated_minutes: 5 },
        { id: 'ch5-q4', order: 4, prompt: { es: '¿Hubo un mentor o colega en el camino que te marcó?' }, estimated_minutes: 4 },
        { id: 'ch5-q5', order: 5, prompt: { es: 'Si te jubilaste o cambiaste de carrera, comparte ese momento.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch5-q6', order: 6, prompt: { es: '¿Qué lección de vida te enseñó tu trabajo?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch6',
      order: 6,
      title:        { es: 'Criar a los hijos' },
      description:  { es: 'Los años criando a tus hijos.' },
      intro_prompt: { es: 'Mira hacia atrás los años de criar a tus hijos.' },
      questions: [
        { id: 'ch6-q1', order: 1, prompt: { es: 'Cuéntame el día en que nació tu primer hijo.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q2', order: 2, prompt: { es: '¿Cuál fue el recuerdo más feliz de cuando tus hijos eran pequeños?' }, estimated_minutes: 5 },
        { id: 'ch6-q3', order: 3, prompt: { es: '¿Cómo atravesaste un tiempo difícil con tus hijos?' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch6-q4', order: 4, prompt: { es: 'Comparte el momento que estuviste más orgulloso de uno de tus hijos.' }, estimated_minutes: 4 },
        { id: 'ch6-q5', order: 5, prompt: { es: '¿Qué es lo único que más quieres transmitir a tus hijos?' }, estimated_minutes: 5 },
        { id: 'ch6-q6', order: 6, prompt: { es: 'Si tienes nietos, háblame de ellos.' }, estimated_minutes: 4, is_optional: true },
      ],
    },
    {
      id: 'ch7',
      order: 7,
      title:        { es: 'Fe y creencias' },
      description:  { es: 'Las creencias y valores que te han sostenido en la vida.' },
      intro_prompt: { es: 'Comparte las creencias y valores que viven en lo profundo de tu vida.' },
      questions: [
        { id: 'ch7-q1', order: 1, prompt: { es: 'Si tienes una fe, cuéntame cómo comenzó para ti.' }, estimated_minutes: 5, is_optional: true },
        { id: 'ch7-q2', order: 2, prompt: { es: '¿Hubo un momento de profunda comprensión en tu vida?' }, estimated_minutes: 5 },
        { id: 'ch7-q3', order: 3, prompt: { es: '¿Cómo te sostuviste en las temporadas más difíciles?' }, estimated_minutes: 5 },
        { id: 'ch7-q4', order: 4, prompt: { es: '¿Por qué de tu vida estás más agradecido?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch8',
      order: 8,
      title:        { es: 'Las grandes decisiones' },
      description:  { es: 'Las decisiones que cambiaron el rumbo de tu vida.' },
      intro_prompt: { es: 'Mira atrás y trae los grandes momentos que cambiaron el rumbo.' },
      questions: [
        { id: 'ch8-q1', order: 1, prompt: { es: '¿Cuál fue la decisión más grande de tu vida?' }, estimated_minutes: 5 },
        { id: 'ch8-q2', order: 2, prompt: { es: '¿Hubo un encuentro que cambió el rumbo de tu vida?' }, estimated_minutes: 5 },
        { id: 'ch8-q3', order: 3, prompt: { es: 'Si hay una decisión que lamentas, compártela honestamente.' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch8-q4', order: 4, prompt: { es: '¿Qué decisión tomarías otra vez exactamente igual?' }, estimated_minutes: 4 },
      ],
    },
    {
      id: 'ch9',
      order: 9,
      title:        { es: 'Lo que quiero dejar' },
      description:  { es: 'Lo que más quieres transmitir.' },
      intro_prompt: { es: 'Este es el último capítulo. Tómate tu tiempo y cuéntame lo que más quieres dejar.' },
      questions: [
        { id: 'ch9-q1', order: 1, prompt: { es: '¿Qué es lo que más quieres decir a tus hijos y nietos?' }, estimated_minutes: 5 },
        { id: 'ch9-q2', order: 2, prompt: { es: '¿Cuál es la lección más grande que te ha enseñado la vida?' }, estimated_minutes: 5 },
        { id: 'ch9-q3', order: 3, prompt: { es: '¿Hay una tradición o forma de ser que recorre a tu familia?' }, estimated_minutes: 4, is_optional: true },
        { id: 'ch9-q4', order: 4, prompt: { es: '¿Cómo te gustaría más ser recordado?' }, estimated_minutes: 5 },
      ],
    },
  ],
};

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = neon(url);

  const totalQuestions = MEMOIR_ES_STRUCTURE.chapters.reduce((s, c) => s + c.questions.length, 0);
  const totalChapters  = MEMOIR_ES_STRUCTURE.chapters.length;

  await sql`
    INSERT INTO book_template_definitions (
      id, name, description, category, language, default_structure,
      estimated_chapters, estimated_questions, estimated_pages, estimated_days,
      is_active, is_premium, sort_order
    ) VALUES (
      'memoir-es',
      ${JSON.stringify({ es: 'Mis memorias', ko: '내 자서전', en: 'My Memoir' })}::jsonb,
      ${JSON.stringify({ es: 'La historia de tu vida en 9 capítulos.' })}::jsonb,
      'memoir',
      'es',
      ${JSON.stringify(MEMOIR_ES_STRUCTURE)}::jsonb,
      ${totalChapters}, ${totalQuestions}, 120, 90,
      true, false, 3
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

  console.log(`✅ memoir-es seeded — ${totalChapters} chapters, ${totalQuestions} questions`);
})().catch(e => { console.error(e); process.exit(1); });
