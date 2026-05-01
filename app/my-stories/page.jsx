'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import PhotoUploader from '@/components/photos/PhotoUploader';
import s from './page.module.css';

// ── Visibility (Private/Public) 다국어 카피 ────────────────────────────────
const VIS_MSGS = {
  KO: {
    privateBadge     : '🔒 Private',
    publicBadge      : '🌐 Public',
    toggleToPublic   : '🌐 Public으로 변경',
    toggleToPrivate  : '🔒 Private으로 되돌리기',
    confirmTitleToPub: 'Public으로 바꾸시겠어요?',
    confirmTitleToPri: 'Private으로 되돌리시겠어요?',
    confirmIntroToPub: '이 이야기를 Public으로 변경하면:',
    confirmIntroToPri: '이 이야기를 Private으로 변경하면:',
    bulletsToPub     : ['가족과 공유할 수 있게 됩니다', '책으로 만들 수 있게 됩니다', '언제든 다시 Private으로 되돌릴 수 있습니다'],
    bulletsToPri     : ['공유된 책에서 제외됩니다', '누구에게도 다시 보이지 않게 됩니다'],
    cancelBtn        : '취소',
    confirmToPubBtn  : 'Public으로 변경',
    confirmToPriBtn  : 'Private으로 변경',
    saving           : '변경 중…',
    errMsg           : '변경에 실패했습니다. 다시 시도해주세요.',
    continueLabel    : '💬 이어서 말하기',
    continueHint     : '원본은 그대로 두고, 이 이야기에 새로운 내용을 추가합니다.',
    threadTitle      : '추가된 이야기',
    // ─── Collections (2026-04-26) ───
    tabStories       : '내 이야기들',
    tabCollections   : '모음집',
    createCollection : '새 모음집 만들기',
    noCollections    : '아직 모음집이 없어요',
    noCollectionsHint: '이야기들을 주제별로 묶어 정리할 수 있어요',
    fragmentCountLabel: (n) => `이야기 ${n}개`,
    charsLabel       : '자',
    nameLabel        : '이름',
    namePlaceholder  : '예: 가족 이야기, 신앙 여정, Collegiate Grill 추억',
    descriptionLabel : '설명',
    descriptionPlaceholder: '이 모음집은 어떤 이야기들을 담나요?',
    optional         : '선택',
    nameRequired     : '이름을 입력해 주세요',
    create           : '만들기',
    createFailed     : '생성에 실패했어요. 다시 시도해 주세요',
    addFragmentBtn   : '이야기 추가하기',
    noFragmentsInCollection: '아직 이야기가 없어요',
    removeFromCollection: '모음집에서 제거',
    editCollection   : '수정',
    deleteCollection : '삭제',
    confirmDelete    : '이 모음집을 삭제하시겠어요? 이야기들은 그대로 남습니다.',
    closeBtn         : '닫기',
    saveBtn          : '저장',
    selectFragmentsTitle: '추가할 이야기 선택',
    allFragmentsAdded: '모든 이야기가 이미 이 모음집에 있어요',
    loading          : '불러오는 중…',
    doneBtn          : '완료',
    inCollectionsLabel: '속한 모음집',
    noCollectionsForFragment: '아직 어느 모음집에도 속하지 않았어요',
    addToCollectionBtn: '모음집에 추가',
    pickCollectionTitle: '모음집 선택',
    noCollectionsYet : '먼저 모음집을 만들어 주세요',
    continuationChildBlocked: '이어말한 이야기는 부모를 추가하면 함께 따라옵니다.',
    // ─── Page level (Task 44 i18n) ───
    pageTitle        : '나의 이야기들',
    refreshTitle     : '새로고침',
    statLabelStories : '이야기',
    statLabelChars   : '글자 수',
    statLabelLatest  : '최근 생성',
    sectionConfirmed : '완성된 이야기',
    sectionDraft     : '초안',
    statusConfirmed  : '완성',
    statusDraft      : '초안',
    emptyTitleStories: '아직 이야기가 없어요',
    emptyDescStories : '엠마와 대화하다 보면\n소중한 이야기들이 자동으로 모입니다.',
    truncatedTitle   : '이야기가 중간에 끊겼어요',
    truncatedBannerText: '이 이야기는 중간에 끊겼어요. Emma와 이어서 이야기해볼까요?',
    truncatedShort   : '이야기가 중간에 끊겼어요.',
    continueWithEmma : 'Emma와 이어서 이야기하기',
    editMode         : '편집',
    editTitlePlaceholder    : '제목',
    editSubtitlePlaceholder : '부제 (선택)',
    editContentPlaceholder  : '이야기 내용',
    tagsLabel        : '태그',
    confirmDeleteFragment   : '정말 이 이야기를 삭제할까요? 되돌릴 수 없습니다.',
    confirmDeleteYes : '네, 삭제합니다',
    deletingMsg      : '삭제 중…',
    savingMsg        : '저장 중…',
    deleteFragment   : '삭제',
    toastSaved       : '저장되었습니다.',
    toastDeleted     : '삭제되었습니다.',
    toastLoadFailed  : '데이터를 불러오지 못했습니다.',
    ebookSectionTitle: '📖 나만의 ebook',
    ebookSectionDesc : '이야기들을 모아 PDF ebook으로 만들어 드립니다.',
    ebookRequestBtn  : 'ebook 신청',
    ebookRequestEmpty: 'ebook 신청 (이야기가 없음)',
    ebookDownload    : '↓ PDF 다운로드',
    ebookDownloadFailed     : '다운로드에 실패했습니다.',
    ebookDownloadError      : '다운로드 중 오류가 발생했습니다.',
    ebookModalTitle  : 'ebook 신청',
    ebookTitleLabel  : 'ebook 제목',
    ebookTitleDefault: '나의 이야기',
    ebookDedicationLabel    : '헌사 (선택)',
    ebookDedicationPlaceholder : '예: 사랑하는 가족에게…',
    ebookOptionPreface      : '머리말 자동 생성',
    ebookOptionEpilogue     : '맺음말 자동 생성',
    ebookFragmentsLabel     : (sel, total) => `포함할 이야기 (${sel}/${total})`,
    ebookSelectAll   : '전체 선택',
    ebookDeselectAll : '전체 해제',
    ebookSubmit      : '신청하기',
    ebookSubmitting  : '신청 중…',
    ebookSuccessTitle: 'ebook 신청이 완료되었습니다.',
    ebookSuccessDesc : '24시간 내에 정리하여 다운로드 가능합니다.\n완성되면 상태가 업데이트됩니다.',
    bookStatusPending     : 'ebook을 준비 중입니다 (24시간 내)',
    bookStatusGenerating  : 'ebook을 생성 중입니다…',
    bookStatusReview      : 'ebook 검수 중입니다',
    bookStatusCompleted   : 'ebook이 준비되었습니다!',
  },
  EN: {
    privateBadge     : '🔒 Private',
    publicBadge      : '🌐 Public',
    toggleToPublic   : '🌐 Make Public',
    toggleToPrivate  : '🔒 Make Private again',
    confirmTitleToPub: 'Make this story Public?',
    confirmTitleToPri: 'Return this story to Private?',
    confirmIntroToPub: 'If you make this Public:',
    confirmIntroToPri: 'If you make this Private:',
    bulletsToPub     : ['You can share it with family', 'It can be included in a book', 'You can switch it back to Private anytime'],
    bulletsToPri     : ['It will be removed from shared books', 'No one else will be able to see it'],
    cancelBtn        : 'Cancel',
    confirmToPubBtn  : 'Make Public',
    confirmToPriBtn  : 'Make Private',
    saving           : 'Updating…',
    errMsg           : 'Could not update. Please try again.',
    continueLabel    : '💬 Add to this story',
    continueHint     : 'The original stays untouched — your new words will be added as a continuation.',
    threadTitle      : 'Added later',
    // ─── Collections (2026-04-26) ───
    tabStories       : 'My Stories',
    tabCollections   : 'Collections',
    createCollection : 'Create Collection',
    noCollections    : 'No collections yet',
    noCollectionsHint: 'Group stories by theme to organize them',
    fragmentCountLabel: (n) => n === 1 ? '1 story' : `${n} stories`,
    charsLabel       : ' chars',
    nameLabel        : 'Name',
    namePlaceholder  : 'e.g. Family Stories, My Faith Journey, Collegiate Grill Memories',
    descriptionLabel : 'Description',
    descriptionPlaceholder: 'What stories does this collection hold?',
    optional         : 'optional',
    nameRequired     : 'Please enter a name',
    create           : 'Create',
    createFailed     : 'Could not create. Please try again.',
    addFragmentBtn   : 'Add Stories',
    noFragmentsInCollection: 'No stories yet',
    removeFromCollection: 'Remove from collection',
    editCollection   : 'Edit',
    deleteCollection : 'Delete',
    confirmDelete    : 'Delete this collection? The stories themselves will remain.',
    closeBtn         : 'Close',
    saveBtn          : 'Save',
    selectFragmentsTitle: 'Select Stories to Add',
    allFragmentsAdded: 'All your stories are already in this collection',
    loading          : 'Loading…',
    doneBtn          : 'Done',
    inCollectionsLabel: 'In Collections',
    noCollectionsForFragment: 'Not in any collection yet',
    addToCollectionBtn: 'Add to Collection',
    pickCollectionTitle: 'Choose Collection',
    noCollectionsYet : 'Create a collection first',
    continuationChildBlocked: 'Continuation entries follow their parent automatically.',
    // ─── Page level (Task 44 i18n) ───
    pageTitle        : 'My Stories',
    refreshTitle     : 'Refresh',
    statLabelStories : 'Stories',
    statLabelChars   : 'Characters',
    statLabelLatest  : 'Latest',
    sectionConfirmed : 'Completed Stories',
    sectionDraft     : 'Drafts',
    statusConfirmed  : 'Done',
    statusDraft      : 'Draft',
    emptyTitleStories: 'No stories yet',
    emptyDescStories : 'Your stories will appear here\nas you talk with Emma.',
    truncatedTitle   : 'This story was cut off',
    truncatedBannerText: 'This story was cut off. Want to continue it with Emma?',
    truncatedShort   : 'This story was cut off.',
    continueWithEmma : 'Continue with Emma',
    editMode         : 'Edit',
    editTitlePlaceholder    : 'Title',
    editSubtitlePlaceholder : 'Subtitle (optional)',
    editContentPlaceholder  : 'Story content',
    tagsLabel        : 'Tags',
    confirmDeleteFragment   : 'Really delete this story? This cannot be undone.',
    confirmDeleteYes : 'Yes, delete',
    deletingMsg      : 'Deleting…',
    savingMsg        : 'Saving…',
    deleteFragment   : 'Delete',
    toastSaved       : 'Saved.',
    toastDeleted     : 'Deleted.',
    toastLoadFailed  : 'Could not load data.',
    ebookSectionTitle: '📖 Your ebook',
    ebookSectionDesc : 'We can compile your stories into a PDF ebook.',
    ebookRequestBtn  : 'Request ebook',
    ebookRequestEmpty: 'Request ebook (no stories yet)',
    ebookDownload    : '↓ Download PDF',
    ebookDownloadFailed     : 'Download failed.',
    ebookDownloadError      : 'An error occurred while downloading.',
    ebookModalTitle  : 'Request ebook',
    ebookTitleLabel  : 'ebook title',
    ebookTitleDefault: 'My Stories',
    ebookDedicationLabel    : 'Dedication (optional)',
    ebookDedicationPlaceholder : 'e.g. To my beloved family…',
    ebookOptionPreface      : 'Auto-generate preface',
    ebookOptionEpilogue     : 'Auto-generate epilogue',
    ebookFragmentsLabel     : (sel, total) => `Stories to include (${sel}/${total})`,
    ebookSelectAll   : 'Select all',
    ebookDeselectAll : 'Deselect all',
    ebookSubmit      : 'Submit',
    ebookSubmitting  : 'Submitting…',
    ebookSuccessTitle: 'Your ebook request has been received.',
    ebookSuccessDesc : 'It will be ready for download within 24 hours.\nThe status will update when complete.',
    bookStatusPending     : 'Preparing your ebook (within 24 hours)',
    bookStatusGenerating  : 'Generating your ebook…',
    bookStatusReview      : 'ebook is in review',
    bookStatusCompleted   : 'Your ebook is ready!',
  },
  ES: {
    privateBadge     : '🔒 Privado',
    publicBadge      : '🌐 Público',
    toggleToPublic   : '🌐 Hacer público',
    toggleToPrivate  : '🔒 Volver a privado',
    confirmTitleToPub: '¿Hacer pública esta historia?',
    confirmTitleToPri: '¿Volver a privada esta historia?',
    confirmIntroToPub: 'Si la haces pública:',
    confirmIntroToPri: 'Si la haces privada:',
    bulletsToPub     : ['Podrás compartirla con tu familia', 'Podrá incluirse en un libro', 'Puedes volver a privada cuando quieras'],
    bulletsToPri     : ['Se retirará de los libros compartidos', 'Nadie más podrá verla'],
    cancelBtn        : 'Cancelar',
    confirmToPubBtn  : 'Hacer pública',
    confirmToPriBtn  : 'Hacer privada',
    saving           : 'Actualizando…',
    errMsg           : 'No se pudo actualizar. Inténtalo de nuevo.',
    continueLabel    : '💬 Añadir a esta historia',
    continueHint     : 'El original queda intacto — tus nuevas palabras se añadirán como continuación.',
    threadTitle      : 'Añadido después',
    // ─── Collections (2026-04-26) ───
    tabStories       : 'Mis historias',
    tabCollections   : 'Colecciones',
    createCollection : 'Crear colección',
    noCollections    : 'Aún no hay colecciones',
    noCollectionsHint: 'Agrupa historias por tema para organizarlas',
    fragmentCountLabel: (n) => n === 1 ? '1 historia' : `${n} historias`,
    charsLabel       : ' caracteres',
    nameLabel        : 'Nombre',
    namePlaceholder  : 'ej. Historias familiares, Mi camino de fe',
    descriptionLabel : 'Descripción',
    descriptionPlaceholder: '¿Qué historias contiene esta colección?',
    optional         : 'opcional',
    nameRequired     : 'Por favor ingresa un nombre',
    create           : 'Crear',
    createFailed     : 'No se pudo crear. Inténtalo de nuevo.',
    addFragmentBtn   : 'Añadir historias',
    noFragmentsInCollection: 'Aún sin historias',
    removeFromCollection: 'Quitar de la colección',
    editCollection   : 'Editar',
    deleteCollection : 'Eliminar',
    confirmDelete    : '¿Eliminar esta colección? Las historias se conservarán.',
    closeBtn         : 'Cerrar',
    saveBtn          : 'Guardar',
    selectFragmentsTitle: 'Selecciona historias',
    allFragmentsAdded: 'Todas tus historias ya están en esta colección',
    loading          : 'Cargando…',
    doneBtn          : 'Listo',
    inCollectionsLabel: 'En colecciones',
    noCollectionsForFragment: 'Aún no está en ninguna colección',
    addToCollectionBtn: 'Añadir a colección',
    pickCollectionTitle: 'Elegir colección',
    noCollectionsYet : 'Primero crea una colección',
    continuationChildBlocked: 'Las continuaciones siguen automáticamente al padre.',
    // ─── Page level (Task 44 i18n) ───
    pageTitle        : 'Mis historias',
    refreshTitle     : 'Actualizar',
    statLabelStories : 'Historias',
    statLabelChars   : 'Caracteres',
    statLabelLatest  : 'Última',
    sectionConfirmed : 'Historias completas',
    sectionDraft     : 'Borradores',
    statusConfirmed  : 'Lista',
    statusDraft      : 'Borrador',
    emptyTitleStories: 'Aún no hay historias',
    emptyDescStories : 'Tus historias aparecerán aquí\nmientras hablas con Emma.',
    truncatedTitle   : 'Esta historia se interrumpió',
    truncatedBannerText: 'Esta historia se interrumpió. ¿Quieres continuarla con Emma?',
    truncatedShort   : 'Esta historia se interrumpió.',
    continueWithEmma : 'Continuar con Emma',
    editMode         : 'Editar',
    editTitlePlaceholder    : 'Título',
    editSubtitlePlaceholder : 'Subtítulo (opcional)',
    editContentPlaceholder  : 'Contenido de la historia',
    tagsLabel        : 'Etiquetas',
    confirmDeleteFragment   : '¿Eliminar esta historia? No se puede deshacer.',
    confirmDeleteYes : 'Sí, eliminar',
    deletingMsg      : 'Eliminando…',
    savingMsg        : 'Guardando…',
    deleteFragment   : 'Eliminar',
    toastSaved       : 'Guardado.',
    toastDeleted     : 'Eliminado.',
    toastLoadFailed  : 'No se pudieron cargar los datos.',
    ebookSectionTitle: '📖 Tu ebook',
    ebookSectionDesc : 'Podemos compilar tus historias en un ebook PDF.',
    ebookRequestBtn  : 'Solicitar ebook',
    ebookRequestEmpty: 'Solicitar ebook (sin historias)',
    ebookDownload    : '↓ Descargar PDF',
    ebookDownloadFailed     : 'Falló la descarga.',
    ebookDownloadError      : 'Ocurrió un error al descargar.',
    ebookModalTitle  : 'Solicitar ebook',
    ebookTitleLabel  : 'Título del ebook',
    ebookTitleDefault: 'Mis historias',
    ebookDedicationLabel    : 'Dedicatoria (opcional)',
    ebookDedicationPlaceholder : 'ej. A mi querida familia…',
    ebookOptionPreface      : 'Generar prólogo automático',
    ebookOptionEpilogue     : 'Generar epílogo automático',
    ebookFragmentsLabel     : (sel, total) => `Historias a incluir (${sel}/${total})`,
    ebookSelectAll   : 'Seleccionar todas',
    ebookDeselectAll : 'Deseleccionar todas',
    ebookSubmit      : 'Enviar',
    ebookSubmitting  : 'Enviando…',
    ebookSuccessTitle: 'Tu solicitud de ebook se ha recibido.',
    ebookSuccessDesc : 'Estará listo para descargar en 24 horas.\nEl estado se actualizará al completarse.',
    bookStatusPending     : 'Preparando tu ebook (en 24 horas)',
    bookStatusGenerating  : 'Generando tu ebook…',
    bookStatusReview      : 'ebook en revisión',
    bookStatusCompleted   : '¡Tu ebook está listo!',
  },
};

function useLang() {
  const [lang, setLang] = useState('KO');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = (localStorage.getItem('lang') || 'ko').toUpperCase();
    if (['KO', 'EN', 'ES'].includes(stored)) setLang(stored);
  }, []);
  return lang;
}

// ── helpers ────────────────────────────────────────────────────
function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function authFetch(url, opts = {}) {
  const token = getToken();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function fmtDate(d, lang = 'KO') {
  if (!d) return '';
  const dt = new Date(d);
  const locale = lang === 'EN' ? 'en-US' : lang === 'ES' ? 'es-ES' : 'ko-KR';
  return dt.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateShort(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`;
}

function preview(text, max = 100) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ── Status label helpers ────────────────────────────────────────
function getBookStatusInfo(status, vm) {
  const map = {
    pending   : { msg: vm.bookStatusPending,    cls: 'pendingMsg',   card: 'pending'   },
    generating: { msg: vm.bookStatusGenerating, cls: 'pendingMsg',   card: 'pending'   },
    review    : { msg: vm.bookStatusReview,     cls: 'reviewMsg',    card: 'review'    },
    completed : { msg: vm.bookStatusCompleted,  cls: 'completedMsg', card: 'completed' },
    published : { msg: vm.bookStatusCompleted,  cls: 'completedMsg', card: 'completed' },
  };
  return map[status] || map.pending;
}

// ── Spinner ─────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className={s.spinner}>
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
      <div className={s.spinnerDot} />
    </div>
  );
}

// ── Fragment Detail Modal ────────────────────────────────────────
// ── Fragment Modal ─────────────────────────────────────────────────────────
function FragmentModal({ fragment, onClose, onUpdated, onDeleted, lang = 'KO' }) {
  const router = useRouter();
  const [mode, setMode]           = useState('view');  // 'view' | 'edit' | 'confirmDelete' | 'confirmVisibility'
  const [editTitle, setEditTitle] = useState(fragment.title || '');
  const [editSubtitle, setEditSub] = useState(fragment.subtitle || '');
  const [editContent, setEditCont] = useState(fragment.content || '');
  const [saving, setSaving]       = useState(false);
  const [currentVis, setCurrentVis] = useState(fragment.visibility || 'private');
  const [continuations, setContinuations] = useState(fragment.continuations || []);
  const [fragmentCollections, setFragmentCollections] = useState(fragment.collections || []);
  const [showPicker, setShowPicker] = useState(false);
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  // 🆕 2026-04-25: Load continuations (thread children) + collections when modal opens
  const reloadFragmentMeta = useCallback(async () => {
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`);
      const data = await res.json();
      if (data?.fragment) {
        if (data.fragment.continuations) setContinuations(data.fragment.continuations);
        if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
      }
    } catch (e) {
      console.warn('[FragmentModal] meta load failed:', e.message);
    }
  }, [fragment.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/fragments/${fragment.id}`);
        const data = await res.json();
        if (!cancelled && data?.fragment) {
          if (data.fragment.continuations) setContinuations(data.fragment.continuations);
          if (data.fragment.collections) setFragmentCollections(data.fragment.collections);
        }
      } catch (e) {
        console.warn('[FragmentModal] continuations load failed:', e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fragment.id]);

  const allTags = [
    ...(fragment.tags_theme   || []).map(t => ({ text: t, cls: s.tagTheme })),
    ...(fragment.tags_emotion || []).map(t => ({ text: t, cls: s.tagEmotion })),
    ...(fragment.tags_people  || []).map(t => ({ text: t, cls: s.tagPeople })),
    ...(fragment.tags_era     || []).map(t => ({ text: t, cls: s.tag })),
    ...(fragment.tags_place   || []).map(t => ({ text: t, cls: s.tag })),
  ];

  async function handleSave() {
    if (!editTitle.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle, subtitle: editSubtitle, content: editContent }),
      });
      const data = await res.json();
      if (data.fragment) { onUpdated(data.fragment); setMode('view'); }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await authFetch(`/api/fragments/${fragment.id}`, { method: 'DELETE' });
      onDeleted(fragment.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleVisibility() {
    const newVis = currentVis === 'public' ? 'private' : 'public';
    setSaving(true);
    try {
      const res = await authFetch(`/api/fragments/${fragment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: newVis }),
      });
      const data = await res.json();
      if (data.fragment) {
        setCurrentVis(data.fragment.visibility);
        onUpdated(data.fragment);
        setMode('view');
      } else {
        alert(vm.errMsg);
      }
    } catch {
      alert(vm.errMsg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />

        {/* Header */}
        <div className={s.modalHeader}>
          <div>
            <div className={s.modalTitle}>
              {mode === 'edit' ? vm.editMode : fragment.title}
            </div>
            {mode === 'view' && fragment.subtitle && (
              <div className={s.modalSubtitle}>{fragment.subtitle}</div>
            )}
          </div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              <div className={s.modalVisibilityRow}>
                <span className={(currentVis === 'public') ? s.visibilityBadgePublicLg : s.visibilityBadgePrivateLg}>
                  {(currentVis === 'public') ? vm.publicBadge : vm.privateBadge}
                </span>
              </div>

              {/* 🆕 2026-04-25: Continue button moved here — right under title/visibility,
                  so users don't need to scroll past long fragments to find it. */}
              <button
                className={s.continueBtn}
                onClick={() => router.push(`/chat?continueFragment=${fragment.id}`)}
              >
                {vm.continueLabel}
              </button>
              <div className={s.continueHint}>{vm.continueHint}</div>

              {/* 🔥 Task 53 #4 — modal flow reordered. Previously:
                    visibility → continue → COLLECTIONS → body → truncated
                    → tags → thread → actions.
                  Tim's first scan said the collections block above the
                  body felt like an interruption. New order:
                    visibility → continue → BODY → truncated → THREAD
                    → tags → COLLECTIONS → actions.
                  Continuations now sit right under their parent body so
                  the eye flows top-to-bottom through the story. */}

              <div className={s.modalContent}>
                <ReactMarkdown>{fragment.content || ''}</ReactMarkdown>
              </div>

              {/* 🔥 Task 75 — photo attachment (max 2). Sits between
                  the body and the continuations thread so the photos
                  feel like part of the story, not an afterthought. */}
              <div className={s.photosSection}>
                <div className={s.photosLabel}>
                  {lang === 'EN' ? '📷 Photos' : lang === 'ES' ? '📷 Fotos' : '📷 사진'}
                </div>
                <PhotoUploader
                  fragmentId={fragment.id}
                  lang={String(lang).toLowerCase()}
                  onChange={() => onUpdated && onUpdated({ ...fragment })}
                />
              </div>

              {fragment.truncated && (
                <div className={s.truncatedBanner}>
                  <div className={s.truncatedBannerText}>
                    {vm.truncatedBannerText}
                  </div>
                  <button
                    className={s.regenerateBtn}
                    onClick={() => {
                      router.push(`/chat?topic=${encodeURIComponent(fragment.title)}&fromFragment=${fragment.id}`);
                    }}
                  >
                    {vm.continueWithEmma}
                  </button>
                </div>
              )}

              {/* 🆕 2026-04-25: Continuation thread display.
                  Now placed directly under the parent body so the
                  added stories read as a continuation, not a footnote. */}
              {continuations.length > 0 && (
                <div className={s.threadSection}>
                  <div className={s.threadTitle}>{vm.threadTitle}</div>
                  {continuations.map((c, i) => (
                    <div key={c.id} className={s.threadItem}>
                      <div className={s.threadOrder}>#{c.thread_order ?? i + 1}</div>
                      <div className={s.threadContent}>
                        <ReactMarkdown>{c.content || ''}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {allTags.length > 0 && (
                <div className={s.modalTagSection}>
                  <div className={s.modalTagLabel}>{vm.tagsLabel}</div>
                  <div className={s.tagRow}>
                    {allTags.map((t, i) => (
                      <span key={i} className={`${s.tag} ${t.cls}`}>{t.text}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 🔥 Task 53 #4: collections moved below body so it acts
                  as a curation footer rather than a header interruption.
                  Only root fragments get this surface — continuations
                  follow their parent's collection membership. */}
              {!fragment.parent_fragment_id && (
                <div className={s.fragmentCollectionsSection}>
                  <div className={s.collectionsLabel}>{vm.inCollectionsLabel}</div>
                  {fragmentCollections.length > 0 ? (
                    <div className={s.collectionTags}>
                      {fragmentCollections.map(c => (
                        <span key={c.id} className={s.collectionTag}>📚 {c.name}</span>
                      ))}
                    </div>
                  ) : (
                    <div className={s.noCollections}>{vm.noCollectionsForFragment}</div>
                  )}
                  <button
                    className={s.addToCollectionBtn}
                    onClick={() => setShowPicker(true)}
                  >
                    📚 {vm.addToCollectionBtn}
                  </button>
                </div>
              )}

              <div className={s.modalActions}>
                <button className={s.editBtn} onClick={() => setMode('edit')}>{vm.editMode}</button>
                <button className={s.visibilityBtn} onClick={() => setMode('confirmVisibility')}>
                  {currentVis === 'private' ? vm.toggleToPublic : vm.toggleToPrivate}
                </button>
                <button className={s.deleteBtn} onClick={() => setMode('confirmDelete')}>{vm.deleteFragment}</button>
              </div>
            </>
          )}

          {/* ── CONFIRM VISIBILITY CHANGE ── */}
          {mode === 'confirmVisibility' && (() => {
            const toPublic = currentVis === 'private';
            const bullets  = toPublic ? vm.bulletsToPub : vm.bulletsToPri;
            return (
              <>
                <div className={s.confirmTitle}>
                  {toPublic ? vm.confirmTitleToPub : vm.confirmTitleToPri}
                </div>
                <div className={s.confirmBody}>
                  {toPublic ? vm.confirmIntroToPub : vm.confirmIntroToPri}
                  <ul className={s.confirmList}>
                    {bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div className={s.confirmRow}>
                  <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
                  <button
                    className={s.visibilityBtn}
                    onClick={handleToggleVisibility}
                    disabled={saving}
                    style={{ flex: 1 }}
                  >
                    {saving ? vm.saving : (toPublic ? vm.confirmToPubBtn : vm.confirmToPriBtn)}
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── CONFIRM DELETE ── */}
          {mode === 'confirmDelete' && (
            <>
              <div className={s.confirmMsg}>{vm.confirmDeleteFragment}</div>
              <div className={s.confirmRow}>
                <button className={s.deleteBtn} onClick={handleDelete} disabled={saving}
                  style={{ flex: 1 }}>
                  {saving ? vm.deletingMsg : vm.confirmDeleteYes}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}

          {/* ── EDIT MODE ── */}
          {mode === 'edit' && (
            <>
              <input
                className={s.editInput}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder={vm.editTitlePlaceholder}
              />
              <input
                className={s.editInput}
                value={editSubtitle}
                onChange={e => setEditSub(e.target.value)}
                placeholder={vm.editSubtitlePlaceholder}
              />
              <textarea
                className={s.editArea}
                value={editContent}
                onChange={e => setEditCont(e.target.value)}
                placeholder={vm.editContentPlaceholder}
              />
              <div className={s.modalActions}>
                <button className={s.saveBtn} onClick={handleSave}
                  disabled={saving || !editTitle.trim() || !editContent.trim()}>
                  {saving ? vm.savingMsg : vm.saveBtn}
                </button>
                <button className={s.cancelBtn} onClick={() => setMode('view')}>{vm.cancelBtn}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {showPicker && (
      <FragmentCollectionPicker
        fragmentId={fragment.id}
        currentCollectionIds={fragmentCollections.map(c => c.id)}
        lang={lang}
        onClose={() => setShowPicker(false)}
        onChanged={reloadFragmentMeta}
      />
    )}
    </>
  );
}

// ── Ebook Request Modal ──────────────────────────────────────────
function EbookModal({ fragments, onClose, onSuccess, lang = 'KO' }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [title, setTitle]           = useState(vm.ebookTitleDefault);
  const [dedication, setDedication] = useState('');
  const [autoPreface, setAutoPreface]   = useState(true);
  const [autoEpilogue, setAutoEpilogue] = useState(true);
  const [selectedIds, setSelectedIds]   = useState(() =>
    new Set(fragments.map(f => f.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);

  function toggleFragment(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === fragments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(fragments.map(f => f.id)));
    }
  }

  async function handleSubmit() {
    if (!title.trim() || selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/books/request', {
        method: 'POST',
        body: JSON.stringify({
          title       : title.trim(),
          dedication  : dedication.trim() || null,
          autoPreface,
          autoEpilogue,
          fragmentIds : [...selectedIds],
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone(true);
        onSuccess();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = selectedIds.size === fragments.length;

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />

        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.ebookModalTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={s.modalBody}>
          {done ? (
            <div className={s.successBox}>
              <div className={s.successIcon}>📖</div>
              <div className={s.successTitle}>{vm.ebookSuccessTitle}</div>
              <div className={s.successDesc} style={{ whiteSpace: 'pre-line' }}>
                {vm.ebookSuccessDesc}
              </div>
            </div>
          ) : (
            <>
              {/* Title */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>{vm.ebookTitleLabel}</label>
                <input
                  className={s.formInput}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={vm.ebookTitleDefault}
                />
              </div>

              {/* Dedication */}
              <div className={s.formGroup}>
                <label className={s.formLabel}>{vm.ebookDedicationLabel}</label>
                <textarea
                  className={`${s.formInput} ${s.formTextarea}`}
                  value={dedication}
                  onChange={e => setDedication(e.target.value)}
                  placeholder={vm.ebookDedicationPlaceholder}
                />
              </div>

              {/* Options */}
              <div className={s.checkGroup}>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoPreface}
                    onChange={e => setAutoPreface(e.target.checked)} />
                  {vm.ebookOptionPreface}
                </label>
                <label className={s.checkLabel}>
                  <input type="checkbox" checked={autoEpilogue}
                    onChange={e => setAutoEpilogue(e.target.checked)} />
                  {vm.ebookOptionEpilogue}
                </label>
              </div>

              {/* Fragment selection */}
              <div className={s.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className={s.formLabel}>
                    {vm.ebookFragmentsLabel(selectedIds.size, fragments.length)}
                  </label>
                  <button
                    onClick={toggleAll}
                    style={{ background: 'none', border: 'none', fontSize: 12,
                      color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}>
                    {allSelected ? vm.ebookDeselectAll : vm.ebookSelectAll}
                  </button>
                </div>
                <div className={s.fragmentPicker}>
                  {fragments.map(f => (
                    <div key={f.id} className={s.fragmentPickerItem}
                      onClick={() => toggleFragment(f.id)}>
                      <input type="checkbox" readOnly
                        checked={selectedIds.has(f.id)}
                        onChange={() => toggleFragment(f.id)} />
                      <span className={s.fragmentPickerName}>{f.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className={s.ctaBtn}
                onClick={handleSubmit}
                disabled={submitting || !title.trim() || selectedIds.size === 0}>
                {submitting ? vm.ebookSubmitting : vm.ebookSubmit}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UserCollection components (2026-04-26 — Task 36)
// ═══════════════════════════════════════════════════════════════

function CollectionsView({ collections, onCreated, onChanged, lang, fragments }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openCollectionId, setOpenCollectionId] = useState(null);

  return (
    <div className={s.collectionsContainer}>
      <button
        className={s.createCollectionBtn}
        onClick={() => setShowCreateModal(true)}
      >
        ➕ {vm.createCollection}
      </button>

      {collections.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}>📚</div>
          <div className={s.emptyTitle}>{vm.noCollections}</div>
          <div className={s.emptyDesc}>{vm.noCollectionsHint}</div>
        </div>
      ) : (
        <div className={s.collectionsList}>
          {collections.map(c => (
            <button
              key={c.id}
              className={s.collectionCard}
              onClick={() => setOpenCollectionId(c.id)}
            >
              <div className={s.collectionTitle}>{c.name}</div>
              {c.description && (
                <div className={s.collectionDesc}>{c.description}</div>
              )}
              <div className={s.collectionMeta}>
                {vm.fragmentCountLabel(c.fragment_count || 0)} · {(c.total_word_count || 0).toLocaleString()}{vm.charsLabel}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateCollectionModal
          lang={lang}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            onCreated();
          }}
        />
      )}

      {openCollectionId && (
        <CollectionDetailModal
          collectionId={openCollectionId}
          lang={lang}
          fragments={fragments}
          onClose={() => setOpenCollectionId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

function CreateCollectionModal({ lang, onClose, onCreated }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!name.trim()) {
      setError(vm.nameRequired);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/collections', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });
      if (res.ok) {
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || vm.createFailed);
      }
    } catch {
      setError(vm.createFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.createCollection}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          <label className={s.formLabelCol}>{vm.nameLabel}</label>
          <input
            type="text"
            className={s.formInputCol}
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={200}
            placeholder={vm.namePlaceholder}
            autoFocus
          />

          <label className={s.formLabelCol}>{vm.descriptionLabel} ({vm.optional})</label>
          <textarea
            className={s.formTextareaCol}
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            placeholder={vm.descriptionPlaceholder}
          />

          {error && <div className={s.errorMsg}>{error}</div>}

          <div className={s.modalActions}>
            <button className={s.cancelBtn} onClick={onClose} disabled={saving}>
              {vm.cancelBtn}
            </button>
            <button
              className={s.btnPrimaryCol}
              onClick={handleSubmit}
              disabled={saving || !name.trim()}
            >
              {saving ? vm.saving : vm.create}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectionDetailModal({ collectionId, lang, fragments, onClose, onChanged }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddFragmentModal, setShowAddFragmentModal] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/collections/${collectionId}`);
      if (res.ok) {
        const data = await res.json();
        setCollection(data.collection);
        setEditName(data.collection.name);
        setEditDescription(data.collection.description || '');
      }
    } catch (e) {
      console.error('[CollectionDetailModal load]', e.message);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!editName.trim()) {
      setError(vm.nameRequired);
      return;
    }
    setError('');
    try {
      const res = await authFetch(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        await load();
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || vm.errMsg);
      }
    } catch {
      setError(vm.errMsg);
    }
  }

  async function handleDelete() {
    if (!window.confirm(vm.confirmDelete)) return;
    try {
      const res = await authFetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onChanged();
        onClose();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemoveFragment(fragmentId) {
    try {
      const res = await authFetch(
        `/api/collections/${collectionId}/fragments/${fragmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await load();
        onChanged();
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loading || !collection) {
    return (
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          <div className={s.modalBody}><Spinner /></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={s.modal}>
          <div className={s.modalHandle} />
          <div className={s.modalHeader}>
            <div className={s.modalTitle}>
              {editing ? vm.editCollection : collection.name}
            </div>
            <button className={s.modalClose} onClick={onClose}>✕</button>
          </div>

          <div className={s.modalBody}>
            {editing ? (
              <>
                <label className={s.formLabelCol}>{vm.nameLabel}</label>
                <input
                  type="text"
                  className={s.formInputCol}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={200}
                />
                <label className={s.formLabelCol}>{vm.descriptionLabel}</label>
                <textarea
                  className={s.formTextareaCol}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder={vm.descriptionPlaceholder}
                />
                {error && <div className={s.errorMsg}>{error}</div>}
                <div className={s.modalActions}>
                  <button className={s.cancelBtn} onClick={() => { setEditing(false); setError(''); }}>
                    {vm.cancelBtn}
                  </button>
                  <button className={s.btnPrimaryCol} onClick={handleSave}>
                    {vm.saveBtn}
                  </button>
                </div>
              </>
            ) : (
              <>
                {collection.description && (
                  <p className={s.collectionDescFull}>{collection.description}</p>
                )}
                <div className={s.collectionMetaFull}>
                  {vm.fragmentCountLabel(collection.fragment_count || 0)} · {(collection.total_word_count || 0).toLocaleString()}{vm.charsLabel}
                </div>

                <button
                  className={s.addFragmentBtn}
                  onClick={() => setShowAddFragmentModal(true)}
                >
                  ➕ {vm.addFragmentBtn}
                </button>

                <div className={s.fragmentList}>
                  {collection.fragments.length === 0 ? (
                    <div className={s.emptyHint}>{vm.noFragmentsInCollection}</div>
                  ) : (
                    collection.fragments.map(f => (
                      <div key={f.id} className={s.fragmentRow}>
                        <div className={s.fragmentRowMain}>
                          <div className={s.fragmentRowTitle}>📄 {f.title}</div>
                          <div className={s.fragmentRowMeta}>
                            {(f.word_count || 0).toLocaleString()}{vm.charsLabel}
                            {f.continuation_count > 0 && ` · +${f.continuation_count}`}
                          </div>
                        </div>
                        <button
                          className={s.removeBtn}
                          onClick={() => handleRemoveFragment(f.id)}
                          title={vm.removeFromCollection}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {error && <div className={s.errorMsg}>{error}</div>}

                <div className={s.modalActions}>
                  <button className={s.btnDangerCol} onClick={handleDelete}>
                    {vm.deleteCollection}
                  </button>
                  <button className={s.cancelBtn} onClick={() => setEditing(true)}>
                    {vm.editCollection}
                  </button>
                  <button className={s.btnPrimaryCol} onClick={onClose}>
                    {vm.closeBtn}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAddFragmentModal && (
        <AddFragmentToCollectionModal
          collectionId={collectionId}
          allFragments={fragments}
          existingFragmentIds={collection.fragments.map(f => f.id)}
          lang={lang}
          onClose={() => setShowAddFragmentModal(false)}
          onAdded={async () => {
            await load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AddFragmentToCollectionModal({ collectionId, allFragments, existingFragmentIds, lang, onClose, onAdded }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [adding, setAdding] = useState(null);

  // Only root fragments (parent_fragment_id IS NULL) can be added
  const rootFragments = (allFragments || []).filter(f => !f.parent_fragment_id);
  const available = rootFragments.filter(f => !existingFragmentIds.includes(f.id));

  async function handleAdd(fragmentId) {
    setAdding(fragmentId);
    try {
      const res = await authFetch(`/api/collections/${collectionId}/fragments`, {
        method: 'POST',
        body: JSON.stringify({ fragmentId }),
      });
      if (res.ok || res.status === 409) {
        await onAdded();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.selectFragmentsTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          {available.length === 0 ? (
            <div className={s.emptyHint}>{vm.allFragmentsAdded}</div>
          ) : (
            <div className={s.fragmentSelectList}>
              {available.map(f => (
                <button
                  key={f.id}
                  className={s.fragmentSelectRow}
                  onClick={() => handleAdd(f.id)}
                  disabled={adding === f.id}
                >
                  <div className={s.fragmentSelectMain}>
                    <div className={s.fragmentSelectTitle}>📄 {f.title}</div>
                    <div className={s.fragmentSelectMeta}>
                      {(f.word_count || 0).toLocaleString()}{vm.charsLabel}
                    </div>
                  </div>
                  <div className={s.addIndicator}>
                    {adding === f.id ? '…' : '➕'}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className={s.modalActions}>
            <button className={s.btnPrimaryCol} onClick={onClose}>
              {vm.doneBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FragmentCollectionPicker({ fragmentId, currentCollectionIds, lang, onClose, onChanged }) {
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // Track local membership so toggling reflects immediately
  const [localIds, setLocalIds] = useState(new Set(currentCollectionIds));

  useEffect(() => {
    setLocalIds(new Set(currentCollectionIds));
  }, [currentCollectionIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/collections');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCollections(data.collections || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 🆕 2026-04-26 (Task 37): Optimistic updates so seniors see the count change immediately.
  // localIds + collections[i].fragment_count are updated BEFORE the request fires; on failure they roll back.
  function bumpCount(collectionId, delta) {
    setCollections(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, fragment_count: Math.max(0, (c.fragment_count || 0) + delta) }
        : c
    ));
  }

  async function handleAdd(collectionId) {
    setBusyId(collectionId);
    // Optimistic
    setLocalIds(prev => new Set(prev).add(collectionId));
    bumpCount(collectionId, +1);
    try {
      const res = await authFetch(`/api/collections/${collectionId}/fragments`, {
        method: 'POST',
        body: JSON.stringify({ fragmentId }),
      });
      if (res.ok || res.status === 409) {
        // 409 = already in collection on server — keep optimistic state (it's correct)
        onChanged();
      } else {
        console.warn('[FragmentCollectionPicker] add failed, rolling back', collectionId, res.status);
        setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
        bumpCount(collectionId, -1);
      }
    } catch (e) {
      console.warn('[FragmentCollectionPicker] add error, rolling back', e?.message);
      setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
      bumpCount(collectionId, -1);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(collectionId) {
    setBusyId(collectionId);
    // Optimistic
    setLocalIds(prev => { const n = new Set(prev); n.delete(collectionId); return n; });
    bumpCount(collectionId, -1);
    try {
      const res = await authFetch(
        `/api/collections/${collectionId}/fragments/${fragmentId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        onChanged();
      } else {
        console.warn('[FragmentCollectionPicker] remove failed, rolling back', collectionId, res.status);
        setLocalIds(prev => new Set(prev).add(collectionId));
        bumpCount(collectionId, +1);
      }
    } catch (e) {
      console.warn('[FragmentCollectionPicker] remove error, rolling back', e?.message);
      setLocalIds(prev => new Set(prev).add(collectionId));
      bumpCount(collectionId, +1);
    } finally {
      setBusyId(null);
    }
  }

  function handleToggle(collectionId) {
    const isIn = localIds.has(collectionId);
    return isIn ? handleRemove(collectionId) : handleAdd(collectionId);
  }

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHandle} />
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>{vm.pickCollectionTitle}</div>
          <button className={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={s.modalBody}>
          {loading ? (
            <Spinner />
          ) : collections.length === 0 ? (
            <div className={s.emptyHint}>{vm.noCollectionsYet}</div>
          ) : (
            <div className={s.collectionPickerList}>
              {collections.map(c => {
                const isIn = localIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    className={`${s.collectionPickerRow} ${isIn ? s.collectionPickerActive : ''}`}
                    onClick={() => handleToggle(c.id)}
                    disabled={busyId === c.id}
                  >
                    <div className={s.collectionPickerMain}>
                      <div className={s.collectionPickerTitle}>{c.name}</div>
                      <div className={s.collectionPickerMeta}>
                        {vm.fragmentCountLabel(c.fragment_count || 0)}
                      </div>
                    </div>
                    <div className={s.collectionPickerCheck}>
                      {busyId === c.id ? '…' : (isIn ? '✓' : '➕')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className={s.modalActions}>
            <button className={s.btnPrimaryCol} onClick={onClose}>
              {vm.doneBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function MyStoriesPage() {
  const router = useRouter();
  const lang   = useLang();

  const [fragments, setFragments]   = useState([]);
  const [books, setBooks]           = useState([]);
  const [collections, setCollections] = useState([]);
  const [activeTab, setActiveTab]   = useState('stories');  // 'stories' | 'collections'
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);   // fragment for detail modal
  const [showEbook, setShowEbook]   = useState(false);
  const [toast, setToast]           = useState('');
  const toastTimer = useRef(null);
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  // ── Data loading ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const token = getToken();
    if (!token) {
      // 🔥 Task 74 — stash redirect for the post-login bounce.
      try { sessionStorage.setItem('postLoginRedirect', '/my-stories'); } catch {}
      router.replace('/login');
      return;
    }

    setLoading(true);
    try {
      const [fragRes, bookRes, colRes] = await Promise.all([
        authFetch('/api/fragments?status=draft,confirmed&limit=100'),
        authFetch('/api/books/status'),
        authFetch('/api/collections'),
      ]);

      if (fragRes.status === 401 || bookRes.status === 401) {
        try { sessionStorage.setItem('postLoginRedirect', '/my-stories'); } catch {}
        router.replace('/login');
        return;
      }

      const fragData = await fragRes.json();
      const bookData = await bookRes.json();
      const colData  = colRes.ok ? await colRes.json() : { collections: [] };

      setFragments(fragData.fragments || []);
      setBooks(bookData.books || []);
      setCollections(colData.collections || []);
    } catch (e) {
      console.error(e);
      showToast(vm.toastLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Lightweight refresh for collections only (after create/edit/delete/add/remove)
  const reloadCollections = useCallback(async () => {
    try {
      const res = await authFetch('/api/collections');
      if (res.ok) {
        const data = await res.json();
        setCollections(data.collections || []);
      }
    } catch (e) {
      console.error('[reloadCollections]', e.message);
    }
  }, []);

  // ── Callbacks ────────────────────────────────────────────────
  function handleUpdated(updated) {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f));
    if (selected?.id === updated.id) setSelected(updated);
    showToast(vm.toastSaved);
  }

  function handleDeleted(id) {
    setFragments(prev => prev.filter(f => f.id !== id));
    setSelected(null);
    showToast(vm.toastDeleted);
  }

  function handleEbookSuccess() {
    // Refresh books after a moment
    setTimeout(loadAll, 1200);
  }

  // ── Stats ────────────────────────────────────────────────────
  const totalChars = fragments.reduce((sum, f) => sum + (f.word_count || f.content?.length || 0), 0);
  const lastCreated = fragments.length > 0
    ? fmtDateShort(fragments.reduce((latest, f) =>
        f.created_at > latest ? f.created_at : latest, fragments[0].created_at))
    : '—';

  // ── Render ───────────────────────────────────────────────────
  const confirmedFragments = fragments.filter(f => f.status === 'confirmed');
  const draftFragments     = fragments.filter(f => f.status === 'draft');

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.back()}>‹</button>
          <span className={s.pageTitle}>{vm.pageTitle}</span>
        </div>
        <button className={s.refreshBtn} onClick={loadAll} title={vm.refreshTitle}>↻</button>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ── Tab Bar (2026-04-26 — Task 36) ── */}
          <div className={s.tabBar}>
            <button
              className={`${s.tab} ${activeTab === 'stories' ? s.tabActive : ''}`}
              onClick={() => setActiveTab('stories')}
            >
              {vm.tabStories} ({fragments.length})
            </button>
            <button
              className={`${s.tab} ${activeTab === 'collections' ? s.tabActive : ''}`}
              onClick={() => setActiveTab('collections')}
            >
              {vm.tabCollections} ({collections.length})
            </button>
          </div>

          {activeTab === 'collections' ? (
            <CollectionsView
              collections={collections}
              onCreated={reloadCollections}
              onChanged={reloadCollections}
              lang={lang}
              fragments={fragments}
            />
          ) : (
          <>
          {/* ── Stats Bar ── */}
          <div className={s.statsBar}>
            <div className={s.statItem}>
              <div className={s.statValue}>{fragments.length}</div>
              <div className={s.statLabel}>{vm.statLabelStories}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue}>
                {totalChars >= 1000 ? `${(totalChars / 1000).toFixed(1)}k` : totalChars}
              </div>
              <div className={s.statLabel}>{vm.statLabelChars}</div>
            </div>
            <div className={s.statItem}>
              <div className={s.statValue} style={{ fontSize: 14 }}>{lastCreated}</div>
              <div className={s.statLabel}>{vm.statLabelLatest}</div>
            </div>
          </div>

          {/* ── Confirmed Fragments ── */}
          {confirmedFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>{vm.sectionConfirmed}</div>
              <div className={s.cardList}>
                {confirmedFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Draft Fragments ── */}
          {draftFragments.length > 0 && (
            <>
              <div className={s.sectionTitle}>{vm.sectionDraft}</div>
              <div className={s.cardList}>
                {draftFragments.map(f => (
                  <FragmentCard key={f.id} fragment={f} onClick={() => setSelected(f)} lang={lang} />
                ))}
              </div>
            </>
          )}

          {/* ── Empty State ── */}
          {fragments.length === 0 && (
            <div className={s.emptyState}>
              <div className={s.emptyIcon}>📝</div>
              <div className={s.emptyTitle}>{vm.emptyTitleStories}</div>
              <div className={s.emptyDesc} style={{ whiteSpace: 'pre-line' }}>
                {vm.emptyDescStories}
              </div>
            </div>
          )}

          {/* ── Ebook Section ── */}
          <div className={s.ebookSection}>
            <div className={s.ebookSectionTitle}>{vm.ebookSectionTitle}</div>
            <div className={s.ebookSectionDesc}>{vm.ebookSectionDesc}</div>

            {/* Existing books */}
            {books.length > 0 && (
              <div className={s.ebookStatusList}>
                {books.map(book => {
                  const info = getBookStatusInfo(book.status, vm);
                  return (
                    <div key={book.id} className={`${s.ebookStatusCard} ${s[info.card]}`}>
                      <div className={s.ebookStatusTitle}>{book.title}</div>
                      <div className={`${s.ebookStatusMsg} ${s[info.cls]}`}>{info.msg}</div>
                      {(book.status === 'completed' || book.status === 'published') && book.has_output && (
                        <button className={s.downloadBtn}
                          onClick={() => handleDownload(book.id, book.title, vm)}>
                          {vm.ebookDownload}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              className={s.ctaBtn}
              onClick={() => setShowEbook(true)}
              disabled={fragments.length === 0}>
              {fragments.length === 0 ? vm.ebookRequestEmpty : vm.ebookRequestBtn}
            </button>
          </div>
          </>
          )}
        </>
      )}

      {/* ── Fragment Detail Modal ── */}
      {selected && (
        <FragmentModal
          fragment={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
          lang={lang}
        />
      )}

      {/* ── Ebook Request Modal ── */}
      {showEbook && (
        <EbookModal
          fragments={fragments}
          lang={lang}
          onClose={() => setShowEbook(false)}
          onSuccess={handleEbookSuccess}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className={s.toast}>{toast}</div>}
    </div>
  );
}

// ── Fragment Card ────────────────────────────────────────────────
function FragmentCard({ fragment: f, onClick, lang = 'KO' }) {
  const router = useRouter();
  const vm = VIS_MSGS[lang] || VIS_MSGS.KO;
  // 🔥 Task 53 #2: Tim's first beta scan of /my-stories felt cluttered —
  //    every card showed a status badge ("초안") plus 3–4 colored tag
  //    chips (theme/emotion/people) that read as noise to a senior eye.
  //    The card now keeps only the signals that help the user FIND a
  //    story they recognise: title, subtitle, preview, date, and the
  //    privacy badge. Status + tags moved out of the card surface (they
  //    still live in the detail modal).

  function handleRegenerate(e) {
    e.stopPropagation();
    router.push(`/chat?topic=${encodeURIComponent(f.title)}&fromFragment=${f.id}`);
  }

  return (
    <div className={s.card} onClick={onClick}>
      <div className={s.cardHeader}>
        <div className={s.cardTitle}>
          {f.truncated && <span className={s.truncatedIcon} title={vm.truncatedTitle}>⚠️</span>}
          {f.title}
        </div>
        <div className={s.cardHeaderBadges}>
          <span className={(f.visibility === 'public') ? s.visibilityBadgePublic : s.visibilityBadgePrivate}>
            {(f.visibility === 'public') ? vm.publicBadge : vm.privateBadge}
          </span>
        </div>
      </div>

      {f.subtitle && <div className={s.cardSubtitle}>{f.subtitle}</div>}

      <div className={s.cardPreview}>{preview(f.content, 100)}</div>

      {/* 🔥 Task 75 — photo thumbnails (max 2) right under the preview
          so the user recognizes a story by its picture, not just text. */}
      {Array.isArray(f.photos) && f.photos.length > 0 && (
        <div className={s.cardPhotos}>
          {f.photos.slice(0, 2).map(p => (
            <img key={p.id} src={p.blob_url} alt="" className={s.cardThumb} />
          ))}
        </div>
      )}

      <div className={s.cardFooter}>
        <span className={s.cardDate}>{fmtDateShort(f.created_at)}</span>
        {/* 🆕 Stage 7 — fragments saved as a book question answer get a
            small purple "책에 포함됨" pill so the senior can tell at a
            glance which entries are wired into a book vs free-form. */}
        {f.book_id && (
          <span className={s.bookBadge}>📚 책에 포함됨</span>
        )}
      </div>

      {f.truncated && (
        <div className={s.truncatedBanner}>
          <div className={s.truncatedBannerText}>{vm.truncatedShort}</div>
          <button className={s.regenerateBtn} onClick={handleRegenerate}>
            {vm.continueWithEmma}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Download helper ──────────────────────────────────────────────
async function handleDownload(bookId, title, vm) {
  const token = getToken();
  try {
    const res = await fetch(`/api/books/download/${bookId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { alert(vm?.ebookDownloadFailed || 'Download failed.'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${title || 'ebook'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert(vm?.ebookDownloadError || 'An error occurred while downloading.');
  }
}
