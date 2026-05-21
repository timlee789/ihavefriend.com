/**
 * components/chapter-entry-v3/i18n.js
 *
 * ChapterEntryV3 + QuestionCard 의 UI 메시지 — 3개 언어 (ko/en/es).
 *
 * 사용:
 *   const m = ENTRY_MSGS[lang] || ENTRY_MSGS.ko;
 *   <button>{m.backToTree}</button>
 *   <p>{m.chipSelected(3, 7)}</p>  // 함수 호출 형태
 *
 * Tim 의 영구 통찰 #25 + Step 1d 통찰 — 책 자체는 단일 언어지만 UI 는 사용자
 * lang 따라 3개 언어 모두 지원. 데이터 단일 언어 ≠ UI 단일 언어.
 *
 * Step 2c 콘셉 변경: "질문" → "이야기 주제 (story topic)".
 *   SayAndKeep 의 핵심 철학 — 단답형 질문이 아닌 이야기의 초대.
 *   사용자가 "답한다" 가 아니라 "주제로 이야기한다". UI 텍스트 + LLM 프롬프트만
 *   콘셉 반영. 코드 변수명 (customQuestions, chapter.questions) 는 그대로.
 */

export const ENTRY_MSGS = {
  ko: {
    backToTree: '← 나무로 돌아가기',
    subtitle: '최대 7개까지 선택 가능 · 답한 주제는 언제든 다시 바꿀 수 있어요',
    titleSelect: '마음에 드는 이야기 주제를 선택해주세요',
    titleCompleted: (n) => `${n}개 이야기 모두 완료했어요`,
    subtitleCompleted: '이야기를 수정하거나 다른 주제로 바꿀 수 있어요',
    chipSelected: (cur, max) => `${cur}/${max} 선택`,
    chipCompleted: (n) => `이야기 완료 ${n}개`,
    cardLabelInProgress: '선택됨',
    cardLabelCompleted: '✓ 이야기 완료',
    cardSelectHint: '누르면 선택됩니다',
    cancelAriaLabel: '주제 취소',
    answerBtnContinue: '▶ 이어서 이야기하기',
    answerBtnEdit: '▶ 수정하기',
    newQuestionTitle: '마음에 드는 주제가 없으세요?',
    newQuestionCta: '새 주제 9개 보기',
    generatingTitle: '엠마가 새 주제를 만들고 있어요',
    generatingSubtitle: '잠시만 기다려주세요',
    generatingHint: '평균 5~10초 정도 소요됩니다',
    showMore: (n) => `↓ ${n}개 주제 더 보기`,
    createCustom: '내가 직접 주제 만들기',
    retry: '다시 시도',
    selectMaxAlert: (max) => `최대 ${max}개까지만 선택할 수 있어요. 다른 주제를 취소한 뒤 추가해주세요.`,
    completedNotice: (max) => `${max}개를 모두 채웠어요. 새 주제를 추가하려면 먼저 선택을 하나 취소해주세요.`,
    errorLoginNeeded: '로그인이 필요해요. 다시 로그인 후 시도해주세요.',
    errorGenerateFailed: '새 주제를 만들지 못했어요. 잠시 후 다시 시도해주세요.',
    errorEmpty: '새 주제가 만들어지지 않았어요. 다시 시도해주세요.',
    errorNetwork: '네트워크 오류로 새 주제를 만들지 못했어요. 다시 시도해주세요.',
    errorQuota: '사용량 한도를 초과했어요.',
    cancelWarning: {
      title: '정말로 이 주제를 취소할까요?',
      deleteNotice: (n) => `이 주제에 대해 한 이야기 ${n}개가 모두 삭제됩니다.`,
      irreversible: '한 번 삭제하면 되돌릴 수 없어요.',
      cancelBtn: '아니요, 그대로 둘게요',
      confirmBtn: '네, 이야기까지 모두 삭제',
    },
    createQuestion: {
      title: '내가 직접 주제 만들기',
      subtitle: (chapterTitle) => `${chapterTitle} 챕터에 추가할 주제를 작성하세요`,
      placeholder: '어떤 주제가 떠오르셨나요?',
      counter: (cur, max) => `${cur} / ${max}자`,
      cancelBtn: '취소',
      saveBtn: '주제 저장하기',
      closeAria: '닫기',
    },
    saveModal: {
      title:        '챕터 저장하기',
      bodyMain:     (chapterTitle, keepCount, deletedCount) =>
        `'${chapterTitle}' 챕터를 ${keepCount}개 주제로 저장하시겠습니까?\n선택하지 않은 ${deletedCount}개 주제가 영구 삭제됩니다.`,
      notePreserve: '이야기 있는 주제는 자동으로 포함됩니다.\n삭제되는 주제에 이야기가 있다면 ✏️ 내 이야기에 보관됩니다.',
      cancel:       '취소',
      confirm:      '저장하기',
      saving:       '저장 중...',
      errorGeneric: '저장하지 못했어요. 다시 시도해주세요.',
      errorNetwork: '네트워크 오류가 발생했어요.',
      errorAnsweredMustKeep: '이야기 있는 주제는 자동으로 포함되어야 해요. 페이지를 다시 불러와 주세요.',
    },
    saveButton: {
      // Step 2d — 단일 label 함수. 0 / under-min / over-max / valid 4단계 분기.
      label: (n, max, min) => {
        if (n === 0) return '주제 선택하기';
        if (n < min) return `최소 ${min}개 필요 · ${n}/${max} 선택`;
        if (n > max) return `${n}/${max} (최대 초과)`;
        return `${n}/${max} 주제 저장하기`;
      },
    },
    cardAnsweredLocked:  '이야기 완료 — 자동 포함',
    savedChapterNotice:  (n) => `이 챕터는 저장됐어요. ${n}개 주제로 이야기하면 책이 완성됩니다.`,
    savedBadge:          '✓ 저장됨',
    editTopicAriaLabel:  '주제 제목 바꾸기',
    renameTopicModal: {
      title:        '주제 제목 바꾸기',
      currentLabel: '현재 제목',
      newLabel:     '새 제목',
      placeholder:  '새 주제를 작성해주세요',
      cancel:       '취소',
      save:         '저장',
      saving:       '저장 중...',
      errorEmpty:   '제목을 입력해주세요.',
      errorGeneric: '저장하지 못했어요. 다시 시도해주세요.',
      errorNetwork: '네트워크 오류가 발생했어요.',
    },
  },
  en: {
    backToTree: '← Back to Tree',
    subtitle: 'Select up to 7 · You can change selected topics anytime',
    titleSelect: 'Choose story topics that resonate with you',
    titleCompleted: (n) => `Completed all ${n} stories`,
    subtitleCompleted: 'You can edit stories or swap topics anytime',
    chipSelected: (cur, max) => `${cur}/${max} selected`,
    chipCompleted: (n) => `${n} told`,
    cardLabelInProgress: 'Selected',
    cardLabelCompleted: '✓ Told',
    cardSelectHint: 'Tap to select',
    cancelAriaLabel: 'Cancel topic',
    answerBtnContinue: '▶ Continue telling',
    answerBtnEdit: '▶ Edit story',
    newQuestionTitle: 'Not seeing the right topic?',
    newQuestionCta: 'Show 9 new topics',
    generatingTitle: 'Emma is creating new topics',
    generatingSubtitle: 'Please wait a moment',
    generatingHint: 'Usually takes 5~10 seconds',
    showMore: (n) => `↓ Show ${n} more topics`,
    createCustom: 'Create my own topic',
    retry: 'Try again',
    selectMaxAlert: (max) => `You can select up to ${max} topics. Cancel one before adding more.`,
    completedNotice: (max) => `All ${max} selected. Cancel one to add a new topic.`,
    errorLoginNeeded: 'Please log in again.',
    errorGenerateFailed: 'Could not create new topics. Please try again later.',
    errorEmpty: 'No new topics were created. Please try again.',
    errorNetwork: 'Network error. Could not create new topics. Please try again.',
    errorQuota: 'You have reached your usage limit.',
    cancelWarning: {
      title: 'Cancel this topic?',
      deleteNotice: (n) => `${n} story/stories about this topic will be deleted.`,
      irreversible: 'This cannot be undone.',
      cancelBtn: 'Keep it',
      confirmBtn: 'Yes, delete stories',
    },
    createQuestion: {
      title: 'Create my own topic',
      subtitle: (chapterTitle) => `Topic to add to ${chapterTitle}`,
      placeholder: 'What topic comes to mind?',
      counter: (cur, max) => `${cur} / ${max} chars`,
      cancelBtn: 'Cancel',
      saveBtn: 'Save topic',
      closeAria: 'Close',
    },
    saveModal: {
      title:        'Save chapter',
      bodyMain:     (chapterTitle, keepCount, deletedCount) =>
        `Save '${chapterTitle}' chapter with ${keepCount} topic${keepCount === 1 ? '' : 's'}?\n${deletedCount} unselected topic${deletedCount === 1 ? '' : 's'} will be permanently removed.`,
      notePreserve: 'Topics with stories are automatically kept.\nStories from deleted topics will be saved in ✏️ My Stories.',
      cancel:       'Cancel',
      confirm:      'Save',
      saving:       'Saving...',
      errorGeneric: 'Could not save. Please try again.',
      errorNetwork: 'Network error occurred.',
      errorAnsweredMustKeep: 'Topics with stories must be kept. Please reload the page.',
    },
    saveButton: {
      // Step 2d — single label function. 4 branches: 0 / under-min / over-max / valid.
      label: (n, max, min) => {
        if (n === 0) return 'Select topics';
        if (n < min) return `Need at least ${min} · ${n}/${max} selected`;
        if (n > max) return `${n}/${max} (max exceeded)`;
        return `Save ${n}/${max} topics`;
      },
    },
    cardAnsweredLocked:  'Told — automatically kept',
    savedChapterNotice:  (n) => `This chapter is saved. Tell stories on ${n} topic${n === 1 ? '' : 's'} to complete it.`,
    savedBadge:          '✓ Saved',
    editTopicAriaLabel:  'Rename topic',
    renameTopicModal: {
      title:        'Rename topic',
      currentLabel: 'Current title',
      newLabel:     'New title',
      placeholder:  'Enter a new topic',
      cancel:       'Cancel',
      save:         'Save',
      saving:       'Saving...',
      errorEmpty:   'Please enter a title.',
      errorGeneric: 'Could not save. Please try again.',
      errorNetwork: 'Network error occurred.',
    },
  },
  es: {
    backToTree: '← Volver al árbol',
    subtitle: 'Hasta 7 · Puedes cambiar los temas seleccionados en cualquier momento',
    titleSelect: 'Elige los temas que te conmuevan',
    titleCompleted: (n) => `Completadas todas las ${n} historias`,
    subtitleCompleted: 'Puedes editar historias o cambiar temas en cualquier momento',
    chipSelected: (cur, max) => `${cur}/${max} seleccionados`,
    chipCompleted: (n) => `${n} contadas`,
    cardLabelInProgress: 'Seleccionado',
    cardLabelCompleted: '✓ Contada',
    cardSelectHint: 'Toca para seleccionar',
    cancelAriaLabel: 'Cancelar tema',
    answerBtnContinue: '▶ Continuar contando',
    answerBtnEdit: '▶ Editar historia',
    newQuestionTitle: '¿No encuentras el tema adecuado?',
    newQuestionCta: 'Mostrar 9 temas nuevos',
    generatingTitle: 'Emma está creando nuevos temas',
    generatingSubtitle: 'Por favor espera un momento',
    generatingHint: 'Suele tardar 5~10 segundos',
    showMore: (n) => `↓ Mostrar ${n} temas más`,
    createCustom: 'Crear mi propio tema',
    retry: 'Reintentar',
    selectMaxAlert: (max) => `Puedes seleccionar hasta ${max} temas. Cancela uno antes de añadir más.`,
    completedNotice: (max) => `Los ${max} seleccionados. Cancela uno para añadir uno nuevo.`,
    errorLoginNeeded: 'Por favor inicia sesión de nuevo.',
    errorGenerateFailed: 'No se pudieron crear temas nuevos. Inténtalo más tarde.',
    errorEmpty: 'No se crearon temas nuevos. Inténtalo de nuevo.',
    errorNetwork: 'Error de red. No se pudieron crear temas. Inténtalo de nuevo.',
    errorQuota: 'Has alcanzado tu límite de uso.',
    cancelWarning: {
      title: '¿Cancelar este tema?',
      deleteNotice: (n) => `Se eliminarán ${n} historia(s) sobre este tema.`,
      irreversible: 'Esta acción no se puede deshacer.',
      cancelBtn: 'Mantener',
      confirmBtn: 'Sí, eliminar historias',
    },
    createQuestion: {
      title: 'Crear mi propio tema',
      subtitle: (chapterTitle) => `Tema a añadir a ${chapterTitle}`,
      placeholder: '¿Qué tema te viene a la mente?',
      counter: (cur, max) => `${cur} / ${max} caracteres`,
      cancelBtn: 'Cancelar',
      saveBtn: 'Guardar tema',
      closeAria: 'Cerrar',
    },
    saveModal: {
      title:        'Guardar capítulo',
      bodyMain:     (chapterTitle, keepCount, deletedCount) =>
        `¿Guardar el capítulo '${chapterTitle}' con ${keepCount} tema${keepCount === 1 ? '' : 's'}?\n${deletedCount} tema${deletedCount === 1 ? '' : 's'} no seleccionado${deletedCount === 1 ? '' : 's'} se eliminarán permanentemente.`,
      notePreserve: 'Los temas con historias se mantienen automáticamente.\nLas historias de los temas eliminados se guardarán en ✏️ Mis historias.',
      cancel:       'Cancelar',
      confirm:      'Guardar',
      saving:       'Guardando...',
      errorGeneric: 'No se pudo guardar. Inténtalo de nuevo.',
      errorNetwork: 'Error de red.',
      errorAnsweredMustKeep: 'Los temas con historias deben mantenerse. Recarga la página.',
    },
    saveButton: {
      // Step 2d — función label única. 4 ramas: 0 / under-min / over-max / valid.
      label: (n, max, min) => {
        if (n === 0) return 'Selecciona temas';
        if (n < min) return `Mínimo ${min} · ${n}/${max} seleccionados`;
        if (n > max) return `${n}/${max} (máx excedido)`;
        return `Guardar ${n}/${max} temas`;
      },
    },
    cardAnsweredLocked:  'Contada — incluida automáticamente',
    savedChapterNotice:  (n) => `Este capítulo está guardado. Cuenta historias en ${n} tema${n === 1 ? '' : 's'} para completarlo.`,
    savedBadge:          '✓ Guardado',
    editTopicAriaLabel:  'Renombrar tema',
    renameTopicModal: {
      title:        'Renombrar tema',
      currentLabel: 'Título actual',
      newLabel:     'Nuevo título',
      placeholder:  'Escribe un nuevo tema',
      cancel:       'Cancelar',
      save:         'Guardar',
      saving:       'Guardando...',
      errorEmpty:   'Por favor introduce un título.',
      errorGeneric: 'No se pudo guardar. Inténtalo de nuevo.',
      errorNetwork: 'Error de red.',
    },
  },
};
