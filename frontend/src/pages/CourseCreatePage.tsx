import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsUpDownIcon,
  Bars3Icon,
  BookOpenIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  CurrencyDollarIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  GlobeAltIcon,
  LanguageIcon,
  ListBulletIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlayCircleIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import VideoSourcePicker from '../components/VideoSourcePicker'
import FileUploadWidget from '../components/FileUploadWidget'
import QuizBuilder, { QuizQuestion, createQuestion } from '../components/QuizBuilder'
import apiService from '../services/apiService'

interface Category {
  id: number
  name: string
  slug: string
  icon: string
}

type BuilderStep = 'basics' | 'curriculum' | 'settings' | 'preview'
type LessonType = 'video' | 'material' | 'quiz'
type LessonStatus = 'draft' | 'ready' | 'syncing' | 'synced'

type CourseFormState = {
  title: string
  description: string
  category_id: string
  level: string
  language: string
  thumbnail_url: string
  is_paid: boolean
  price: string
  is_published: boolean
  tags: string[]
}

type BuilderLesson = {
  id: string
  backendId?: number
  title: string
  description: string
  type: LessonType
  status: LessonStatus
  is_free: boolean
  duration_minutes: number
  video_source: 'youtube' | 'bunny' | 'none'
  video_url: string
  bunny_video_id: string
  material_url: string
  material_name: string
  quiz_question_count: number
  quiz_questions: QuizQuestion[]
}

type BuilderSection = {
  id: string
  title: string
  description: string
  lessons: BuilderLesson[]
}

type DraftPayload = {
  form: CourseFormState
  sections: BuilderSection[]
  savedAt: string
}

const LEVELS = [
  { value: 'beginner', label: "Boshlang'ich" },
  { value: 'intermediate', label: "O'rta" },
  { value: 'advanced', label: 'Yuqori' },
]

const LANGUAGES = [
  { value: 'uz', label: "O'zbek" },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]

const STEP_ITEMS: Array<{ id: BuilderStep; title: string; description: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }> = [
  { id: 'basics', title: 'Asosiy maʼlumot', description: 'Kurs nomi, tavsif, thumbnail', icon: PencilSquareIcon },
  { id: 'curriculum', title: 'Curriculum', description: 'Boʻlimlar va darslar', icon: ListBulletIcon },
  { id: 'settings', title: 'Narx va sozlamalar', description: 'Til, daraja, teglar, publish', icon: SparklesIcon },
  { id: 'preview', title: 'Preview', description: 'Kurs tuzilmasi va tekshiruv', icon: EyeIcon },
]

const EMPTY_FORM: CourseFormState = {
  title: '',
  description: '',
  category_id: '',
  level: 'beginner',
  language: 'uz',
  thumbnail_url: '',
  is_paid: false,
  price: '0',
  is_published: false,
  tags: [],
}

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`

const createLesson = (type: LessonType = 'video'): BuilderLesson => ({
  id: uid('lesson'),
  title: '',
  description: '',
  type,
  status: 'draft',
  is_free: type === 'video',
  duration_minutes: 0,
  video_source: type === 'video' ? 'youtube' : 'none',
  video_url: '',
  bunny_video_id: '',
  material_url: '',
  material_name: '',
  quiz_question_count: type === 'quiz' ? 0 : 0,
  quiz_questions: type === 'quiz' ? [createQuestion()] : [],
})

const createSection = (): BuilderSection => ({
  id: uid('section'),
  title: 'Yangi modul',
  description: '',
  lessons: [],
})

const storageKey = (courseId?: number | string) => `sahifalab:course-studio:${courseId ?? 'new'}`

const inputCls = 'w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F26722]/30 focus:border-[#F26722] transition'
const cardCls = 'rounded-[28px] border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/75 shadow-[0_12px_40px_rgba(15,23,42,0.06)] dark:shadow-none'

const getLessonTypeMeta = (type: LessonType) => {
  switch (type) {
    case 'video':
      return { label: 'Video dars', icon: PlayCircleIcon, badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
    case 'material':
      return { label: 'PDF / material', icon: DocumentTextIcon, badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' }
    default:
      return { label: 'Quiz / test', icon: QuestionMarkCircleIcon, badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  }
}

const getLessonSyncLabel = (lesson: BuilderLesson) => {
  if (lesson.status === 'syncing') return 'Sinxronlanmoqda'
  if (lesson.status === 'synced') return 'Sync qilingan'
  if (lesson.type === 'video') return (lesson.video_url || lesson.bunny_video_id) ? 'Tayyor' : 'Video kutilmoqda'
  if (lesson.type === 'material') return lesson.material_url ? 'Material tayyor' : 'Material draft'
  return lesson.quiz_questions.length > 0 ? `${lesson.quiz_questions.length} savol` : 'Savollar kutilmoqda'
}

const isLessonReady = (lesson: BuilderLesson) => {
  if (!lesson.title.trim()) return false
  if (lesson.type === 'video') return !!(lesson.video_url.trim() || lesson.bunny_video_id.trim())
  if (lesson.type === 'material') return !!lesson.material_url.trim() || !!lesson.material_name.trim()
  return lesson.quiz_questions.length > 0 && lesson.quiz_questions.every(q => q.text.trim() && q.options.filter(o => o.text.trim()).length >= 2 && q.options.some(o => o.is_correct && o.text.trim()))
}

const readDraft = (key: string): DraftPayload | null => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as DraftPayload : null
  } catch {
    return null
  }
}

const validateBuilder = (form: CourseFormState, sections: BuilderSection[], mode: 'draft' | 'publish') => {
  const errors: string[] = []
  if (!form.title.trim()) errors.push('Kurs sarlavhasini kiriting')
  if (mode === 'publish' && form.description.trim().length < 40) errors.push('Publish uchun tavsif kamida 40 ta belgidan iborat bo‘lishi kerak')
  if (mode === 'publish' && !form.category_id) errors.push('Kategoriya tanlang')
  if (form.is_paid && (!form.price || Number(form.price) <= 0)) errors.push('Pullik kurs uchun narx kiriting')
  if (mode === 'publish' && !form.thumbnail_url.trim()) errors.push('Publish uchun muqova rasmi kerak')
  if (mode === 'publish' && sections.length === 0) errors.push('Kamida bitta modul yarating')

  sections.forEach((section, sectionIndex) => {
    if (mode === 'publish' && !section.title.trim()) errors.push(`${sectionIndex + 1}-modul uchun nom kiriting`)
    if (mode === 'publish' && section.lessons.length === 0) errors.push(`${section.title || `${sectionIndex + 1}-modul`} ichida kamida bitta dars bo‘lishi kerak`)
    section.lessons.forEach((lesson, lessonIndex) => {
      if (mode === 'publish' && !isLessonReady(lesson)) {
        errors.push(`${section.title || `${sectionIndex + 1}-modul`} / ${lesson.title || `${lessonIndex + 1}-dars`} to‘liq emas`)
      }
    })
  })

  return errors
}

const Field: React.FC<{
  label: string
  hint?: string
  required?: boolean
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  children: React.ReactNode
}> = ({ label, hint, required, icon: Icon, children }) => (
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
      {Icon && <Icon className="h-4 w-4" />}
      <span>{label}</span>
      {required && <span className="text-[#F26722]">*</span>}
    </label>
    {children}
    {hint && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
)



const CourseCreatePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = !!id
  const courseId = id ? parseInt(id, 10) : undefined

  const [form, setForm] = useState<CourseFormState>(EMPTY_FORM)
  const [categories, setCategories] = useState<Category[]>([])
  const [sections, setSections] = useState<BuilderSection[]>([createSection()])
  const [step, setStep] = useState<BuilderStep>('basics')
  const [status, setStatus] = useState<'booting' | 'ready' | 'saving' | 'saved' | 'error'>('booting')
  const [message, setMessage] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [selectedLesson, setSelectedLesson] = useState<{ sectionId: string; lessonId: string } | null>(null)
  const [knownBackendLessonIds, setKnownBackendLessonIds] = useState<number[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [dragItem, setDragItem] = useState<{ type: 'section' | 'lesson'; sectionId: string; lessonId?: string } | null>(null)

  const storageId = courseId ?? 'new'

  useEffect(() => {
    let active = true
    const hydrate = async () => {
      setStatus('booting')
      try {
        const categoriesPromise = apiService.getCategories().catch(() => ({ data: [] }))

        if (isEdit && courseId) {
          const [categoryRes, courseRes, lessonsRes] = await Promise.all([
            categoriesPromise,
            apiService.getCourse(courseId),
            apiService.getLessons(courseId),
          ])
          if (!active) return

          const course = courseRes.data
          const backendLessons = Array.isArray(lessonsRes.data) ? lessonsRes.data : []
          const draft = readDraft(storageKey(courseId))

          setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : [])
          setForm(draft?.form ?? {
            title: course.title ?? '',
            description: course.description ?? '',
            category_id: String(course.category_id ?? ''),
            level: course.level ?? 'beginner',
            language: course.language ?? 'uz',
            thumbnail_url: course.thumbnail_url ?? '',
            is_paid: !!course.is_paid,
            price: String(course.price ?? 0),
            is_published: !!course.is_published,
            tags: [],
          })

          const fallbackSections: BuilderSection[] = [{
            id: uid('section'),
            title: 'Asosiy modul',
            description: 'Platformadagi mavjud darslar',
            lessons: backendLessons.map((lesson: any) => ({
              id: uid('lesson'),
              backendId: lesson.id,
              title: lesson.title ?? '',
              description: lesson.description ?? '',
              type: 'video' as LessonType,
              status: 'synced' as LessonStatus,
              is_free: !!lesson.is_free,
              duration_minutes: lesson.duration_minutes ?? 0,
              video_source: (lesson.video_source ?? 'bunny') as 'youtube' | 'bunny' | 'none',
              video_url: '',
              bunny_video_id: lesson.bunny_video_id ?? '',
              material_url: '',
              material_name: '',
              quiz_question_count: 0,
              quiz_questions: [] as QuizQuestion[],
            })),
          }]

          const nextSections = draft?.sections?.length ? draft.sections : fallbackSections
          setSections(nextSections.length ? nextSections : [createSection()])
          setKnownBackendLessonIds(backendLessons.map((lesson: any) => lesson.id))
          const firstLesson = nextSections.flatMap(section => section.lessons.map(lesson => ({ sectionId: section.id, lessonId: lesson.id })))[0]
          setSelectedLesson(firstLesson ?? null)
          setLastSavedAt(draft?.savedAt ?? '')
        } else {
          const categoryRes = await categoriesPromise
          if (!active) return
          const draft = readDraft(storageKey('new'))
          setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : [])
          setForm(draft?.form ?? EMPTY_FORM)
          const nextSections = draft?.sections?.length ? draft.sections : [createSection()]
          setSections(nextSections)
          const firstLesson = nextSections.flatMap(section => section.lessons.map(lesson => ({ sectionId: section.id, lessonId: lesson.id })))[0]
          setSelectedLesson(firstLesson ?? null)
          setLastSavedAt(draft?.savedAt ?? '')
        }

        setStatus('ready')
      } catch (err: any) {
        if (!active) return
        console.error('[CourseCreate] Hydrate error:', err?.response?.data?.detail || err?.message)
        setMessage('Kurs yuklanmadi. Iltimos, qayta urinib ko\'ring.')
        setStatus('error')
      } finally {
        if (active) setHydrated(true)
      }
    }

    hydrate()
    return () => { active = false }
  }, [courseId, isEdit])

  useEffect(() => {
    if (!hydrated) return
    const payload: DraftPayload = { form, sections, savedAt: new Date().toISOString() }
    window.localStorage.setItem(storageKey(storageId), JSON.stringify(payload))
    setLastSavedAt(payload.savedAt)
  }, [form, sections, hydrated, storageId])

  const lessonLookup = useMemo(() => {
    for (const section of sections) {
      const found = section.lessons.find(item => item.id === selectedLesson?.lessonId)
      if (found) return { section, lesson: found }
    }
    return null
  }, [sections, selectedLesson])

  const totalLessons = useMemo(() => sections.reduce((sum, section) => sum + section.lessons.length, 0), [sections])
  const readyLessons = useMemo(() => sections.reduce((sum, section) => sum + section.lessons.filter(isLessonReady).length, 0), [sections])
  const draftOnlyCount = useMemo(() => sections.reduce((sum, section) => sum + section.lessons.filter(lesson => lesson.type !== 'video').length, 0), [sections])
  const publishErrors = useMemo(() => validateBuilder(form, sections, 'publish'), [form, sections])

  const stepCompletion = useMemo<Record<BuilderStep, boolean>>(() => ({
    basics: !!form.title.trim() && form.description.trim().length >= 20,
    curriculum: totalLessons > 0,
    settings: !form.is_paid || Number(form.price) > 0,
    preview: publishErrors.length === 0,
  }), [form, publishErrors.length, totalLessons])

  const updateForm = <K extends keyof CourseFormState>(key: K, value: CourseFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (status === 'saved') setStatus('ready')
  }

  const updateSection = (sectionId: string, patch: Partial<BuilderSection>) => {
    setSections(prev => prev.map(section => section.id === sectionId ? { ...section, ...patch } : section))
  }

  const updateLesson = (sectionId: string, lessonId: string, patch: Partial<BuilderLesson>) => {
    setSections(prev => prev.map(section => (
      section.id !== sectionId ? section : {
        ...section,
        lessons: section.lessons.map(lesson => lesson.id !== lessonId ? lesson : { ...lesson, ...patch, status: lesson.status === 'synced' ? 'ready' : (patch.status ?? lesson.status) }),
      }
    )))
    if (status === 'saved') setStatus('ready')
  }

  const addSection = () => {
    setSections(prev => [...prev, createSection()])
    setStep('curriculum')
  }

  const duplicateSection = (sectionId: string) => {
    setSections(prev => {
      const section = prev.find(item => item.id === sectionId)
      if (!section) return prev
      const duplicated: BuilderSection = {
        ...section,
        id: uid('section'),
        title: `${section.title} copy`,
        lessons: section.lessons.map(lesson => ({ ...lesson, id: uid('lesson'), backendId: undefined, status: lesson.type === 'video' && (lesson.video_url || lesson.bunny_video_id) ? 'ready' : 'draft' })),
      }
      return [...prev, duplicated]
    })
  }

  const removeSection = (sectionId: string) => {
    if (sections.length === 1) {
      setMessage('Kamida bitta modul qolishi kerak')
      setStatus('error')
      return
    }
    setSections(prev => prev.filter(section => section.id !== sectionId))
    if (selectedLesson?.sectionId === sectionId) setSelectedLesson(null)
  }

  const addLesson = (sectionId: string, type: LessonType) => {
    const lesson = createLesson(type)
    setSections(prev => prev.map(section => section.id === sectionId ? { ...section, lessons: [...section.lessons, lesson] } : section))
    setSelectedLesson({ sectionId, lessonId: lesson.id })
    setStep('curriculum')
  }

  const removeLesson = (sectionId: string, lessonId: string) => {
    setSections(prev => prev.map(section => section.id === sectionId ? { ...section, lessons: section.lessons.filter(lesson => lesson.id !== lessonId) } : section))
    if (selectedLesson?.lessonId === lessonId) setSelectedLesson(null)
  }

  const moveSection = (fromId: string, toId: string) => {
    if (fromId === toId) return
    setSections(prev => {
      const next = [...prev]
      const fromIndex = next.findIndex(section => section.id === fromId)
      const toIndex = next.findIndex(section => section.id === toId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const moveLesson = (fromSectionId: string, lessonId: string, toSectionId: string, targetLessonId?: string) => {
    setSections(prev => {
      const next = prev.map(section => ({ ...section, lessons: [...section.lessons] }))
      const sourceSection = next.find(section => section.id === fromSectionId)
      const targetSection = next.find(section => section.id === toSectionId)
      if (!sourceSection || !targetSection) return prev
      const sourceIndex = sourceSection.lessons.findIndex(lesson => lesson.id === lessonId)
      if (sourceIndex === -1) return prev
      const [moved] = sourceSection.lessons.splice(sourceIndex, 1)
      const targetIndex = targetLessonId ? targetSection.lessons.findIndex(lesson => lesson.id === targetLessonId) : targetSection.lessons.length
      targetSection.lessons.splice(targetIndex === -1 ? targetSection.lessons.length : targetIndex, 0, moved)
      return next
    })
  }

  const handleTagAdd = () => {
    const clean = tagInput.trim().replace(/^#/, '')
    if (!clean) return
    if (form.tags.includes(clean)) { setTagInput(''); return }
    updateForm('tags', [...form.tags, clean])
    setTagInput('')
  }

  const migrateDraftKey = (newCourseId: number) => {
    const currentDraft = window.localStorage.getItem(storageKey('new'))
    if (currentDraft) {
      window.localStorage.setItem(storageKey(newCourseId), currentDraft)
      window.localStorage.removeItem(storageKey('new'))
    }
  }

  const saveCourse = async (publish: boolean) => {
    const errors = validateBuilder(form, sections, publish ? 'publish' : 'draft')
    if (errors.length) {
      setMessage(errors[0])
      setStatus('error')
      setStep(publish && !stepCompletion.basics ? 'basics' : publish && !stepCompletion.curriculum ? 'curriculum' : 'preview')
      return
    }

    setStatus('saving')
    setMessage(publish ? 'Kurs publish qilinmoqda…' : 'Draft saqlanmoqda…')

    try {
      const coursePayload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category_id: form.category_id ? parseInt(form.category_id, 10) : undefined,
        thumbnail_url: form.thumbnail_url.trim(),
        is_paid: form.is_paid,
        price: form.is_paid ? parseFloat(form.price) || 0 : 0,
        level: form.level,
        language: form.language,
        is_published: publish,
      }

      let syncedCourseId = courseId
      if (syncedCourseId) {
        await apiService.updateCourse(syncedCourseId, coursePayload)
      } else {
        const created = await apiService.createCourse(coursePayload)
        syncedCourseId = created.data?.id
        if (!syncedCourseId) throw new Error('Kurs ID qaytmadi')
        migrateDraftKey(syncedCourseId)
      }

      // Sync ALL lesson types (video + material + quiz) with section metadata
      const allSectionLessons = sections.flatMap(section =>
        section.lessons.map(lesson => ({ section, lesson }))
      )
      const keptIds = new Set(allSectionLessons.map(item => item.lesson.backendId).filter(Boolean) as number[])
      const deletedIds = knownBackendLessonIds.filter(existingId => !keptIds.has(existingId))
      for (const lessonId of deletedIds) await apiService.deleteLesson(lessonId)

      const backendIdMap = new Map<string, number>()
      const reordered: Array<{ id: number; order_index: number }> = []
      let orderIndex = 1

      for (const { section, lesson } of allSectionLessons) {
        const payload = {
          course_id:        syncedCourseId,
          title:            lesson.title.trim(),
          description:      lesson.description.trim(),
          video_url:        lesson.type === 'video' ? lesson.video_url : '',
          video_source:     lesson.type === 'video' ? lesson.video_source : 'none',
          bunny_video_id:   lesson.type === 'video' ? lesson.bunny_video_id : '',
          duration_minutes: lesson.duration_minutes,
          order_index:      orderIndex,
          is_free:          lesson.is_free,
          lesson_type:      lesson.type,
          section_title:    section.title.trim(),
          material_url:     lesson.material_url || '',
          material_name:    lesson.material_name || '',
        }

        let lessonBackendId = lesson.backendId
        if (lesson.backendId) {
          await apiService.updateLesson(lesson.backendId, payload)
          backendIdMap.set(lesson.id, lesson.backendId)
          reordered.push({ id: lesson.backendId, order_index: orderIndex })
        } else {
          const created = await apiService.createLesson(payload)
          const createdId = created.data?.id
          if (createdId) {
            lessonBackendId = createdId
            backendIdMap.set(lesson.id, createdId)
            reordered.push({ id: createdId, order_index: orderIndex })
          }
        }

        // Save quiz questions for quiz-type lessons
        if (lesson.type === 'quiz' && lessonBackendId && lesson.quiz_questions.length > 0) {
          try {
            await apiService.saveLessonQuiz(lessonBackendId, {
              title:          lesson.title || 'Test',
              questions:      lesson.quiz_questions,
              time_limit_min: null,
              passing_score:  70,
              is_final:       false,
            })
          } catch (e) {
            console.warn('[CourseCreate] Failed to save quiz for lesson', lessonBackendId, e)
          }
        }

        orderIndex += 1
      }

      if (reordered.length) await apiService.reorderLessons(reordered)

      setSections(prev => prev.map(section => ({
        ...section,
        lessons: section.lessons.map(lesson => ({
          ...lesson,
          backendId: backendIdMap.get(lesson.id) ?? lesson.backendId,
          status: isLessonReady(lesson) ? 'synced' : 'draft',
        })),
      })))
      setKnownBackendLessonIds(reordered.map(item => item.id))
      setMessage(publish ? 'Kurs publish qilindi' : 'Draft saqlandi')
      setStatus('saved')
      setLastSavedAt(new Date().toISOString())

      if (!courseId && syncedCourseId) navigate(`/courses/${syncedCourseId}/edit`, { replace: true })
    } catch (err: any) {
      console.error('[CourseCreate] Save error:', err?.response?.data?.detail || err?.message)
      setMessage('Saqlashda xatolik yuz berdi')
      setStatus('error')
    }
  }

  /* ── Mobile sidebar toggle ───────────────────────────────────────── */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false)

  if (status === 'booting') {
    return (
      <PageWrapper className="space-y-5">
        <div className="space-y-4">
          <div className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-3">{[1,2,3,4].map(item => <div key={item} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />)}</div>
            <div className="space-y-4">{[1,2,3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />)}</div>
          </div>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper className="space-y-0" topPadding="py-0">
      {/* ═══════════════════════════════════════════════════════════════════
          TOP BAR — sticky, shows course title, status, and action buttons
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 lg:-mx-8 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-5 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            <button type="button" onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold text-slate-900 dark:text-white sm:text-base">{form.title || (isEdit ? 'Kurs tahrirlash' : 'Yangi kurs')}</h1>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === 'saved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : status === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {status === 'saved' ? '✓ Saqlangan' : status === 'error' ? '⚠ Xatolik' : status === 'saving' ? '↻ Saqlanmoqda' : 'Draft'}
                </span>
                {lastSavedAt && <span className="hidden sm:inline">· {new Date(lastSavedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
            {/* Mobile step toggle */}
            <button type="button" onClick={() => setMobileSidebarOpen(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 lg:hidden dark:border-slate-700">
              <Bars3Icon className="h-4 w-4" />
            </button>
            <div className="hidden gap-2 sm:flex">
              <button type="button" onClick={() => saveCourse(false)} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#F26722]/30 hover:text-[#F26722] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {status === 'saving' ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownTrayIcon className="h-3.5 w-3.5" />} Draft
              </button>
              <button type="button" onClick={() => saveCourse(true)} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17] disabled:opacity-60">
                {status === 'saving' ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />} Publish
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status message */}
      <AnimatePresence>
        {message && (status === 'error' || status === 'saved') && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pt-3">
            <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${status === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
              {status === 'error' ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" /> : <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />}
              <span className="flex-1">{message}</span>
              <button type="button" onClick={() => { setMessage(''); setStatus('ready') }} className="flex-shrink-0"><XMarkIcon className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile save buttons */}
      <div className="flex gap-2 pt-3 sm:hidden">
        <button type="button" onClick={() => saveCourse(false)} disabled={status === 'saving'} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Draft saqlash
        </button>
        <button type="button" onClick={() => saveCourse(true)} disabled={status === 'saving'} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#F26722] py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 disabled:opacity-60">
          <SparklesIcon className="h-3.5 w-3.5" /> Publish
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN LAYOUT — sidebar + content + optional preview
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-5 pt-5 pb-8 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">

        {/* ── LEFT SIDEBAR — steps + metrics ── */}
        <aside className={`${mobileSidebarOpen ? 'block' : 'hidden'} lg:block space-y-4 lg:sticky lg:top-16 lg:self-start`}>
          {/* Step navigation */}
          <nav className="space-y-2">
            {STEP_ITEMS.map((item) => {
              const Icon = item.icon
              const active = step === item.id
              const completed = stepCompletion[item.id]
              return (
                <button key={item.id} type="button" onClick={() => { setStep(item.id); setMobileSidebarOpen(false) }} className={`group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition ${active ? 'bg-[#F26722]/8 dark:bg-[#F26722]/10' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'}`}>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition ${active ? 'bg-[#F26722] text-white shadow-lg shadow-[#F26722]/25' : completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-500'}`}>
                    {completed && !active ? <CheckCircleIcon className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${active ? 'text-[#F26722]' : 'text-slate-700 dark:text-slate-200'}`}>{item.title}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{item.description}</p>
                  </div>
                  {active && <div className="h-5 w-1 rounded-full bg-[#F26722]" />}
                </button>
              )
            })}
          </nav>

          {/* Metrics */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: ListBulletIcon, label: 'Modullar', value: sections.length, color: 'text-[#F26722]' },
                { icon: PlayCircleIcon, label: 'Darslar', value: totalLessons, color: 'text-blue-500' },
                { icon: CheckCircleIcon, label: 'Tayyor', value: readyLessons, color: 'text-emerald-500' },
                { icon: DocumentDuplicateIcon, label: 'Draft', value: draftOnlyCount, color: 'text-violet-500' },
              ].map(m => (
                <div key={m.label} className="rounded-xl bg-white p-2.5 dark:bg-slate-950/70">
                  <m.icon className={`h-4 w-4 ${m.color}`} />
                  <p className="mt-1.5 text-lg font-bold text-slate-900 dark:text-white">{m.value}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="min-w-0 space-y-5">

          {/* ────────────────────────────────────────────────────────────────
              STEP 1: BASICS
             ──────────────────────────────────────────────────────────────── */}
          {step === 'basics' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Course title — hero input */}
              <div className={`${cardCls} overflow-hidden`}>
                <div className="bg-gradient-to-r from-[#F26722]/5 to-transparent px-5 py-4 dark:from-[#F26722]/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F26722]">Kurs ma'lumotlari</p>
                </div>
                <div className="space-y-5 p-5">
                  <Field label="Kurs sarlavhasi" icon={AcademicCapIcon} required hint="Qisqa, aniq va professional ko'rinadigan nom.">
                    <input value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="Masalan: Python — noldan professional darajaga" className={inputCls} maxLength={120} />
                  </Field>
                  <Field label="Tavsif" icon={DocumentTextIcon} required hint="Talabalar nimani o'rganadi, kimlar uchun va natija qanday bo'ladi.">
                    <textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={5} placeholder="Kurs yakunida talabalar real loyiha yig'a oladi, o'z portfolio-sini boyitadi va zamonaviy stack bilan ishlashni o'rganadi..." className={`${inputCls} resize-none`} />
                    <div className="flex justify-end">
                      <span className={`text-[11px] ${form.description.length >= 40 ? 'text-emerald-500' : 'text-slate-400'}`}>{form.description.length} / 40+</span>
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Kategoriya" icon={ListBulletIcon} required>
                      <select value={form.category_id} onChange={e => updateForm('category_id', e.target.value)} className={inputCls}>
                        <option value="">Kategoriya tanlang</option>
                        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Daraja" icon={GlobeAltIcon}>
                      <select value={form.level} onChange={e => updateForm('level', e.target.value)} className={inputCls}>
                        {LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>

              {/* Thumbnail upload */}
              <div className={`${cardCls} overflow-hidden`}>
                <div className="bg-gradient-to-r from-violet-500/5 to-transparent px-5 py-4 dark:from-violet-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">Muqova rasmi</p>
                </div>
                <div className="p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <FileUploadWidget
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        courseId={courseId}
                        folder="thumbnails"
                        onUploaded={(url) => updateForm('thumbnail_url', url)}
                        existingUrl={form.thumbnail_url}
                        existingName={form.thumbnail_url ? 'course-thumbnail' : undefined}
                        variant="image"
                        label="Muqova rasm yuklang"
                        hint="JPG, PNG, WebP · 16:9 nisbat tavsiya etiladi"
                        maxSizeMB={10}
                      />
                      <p className="text-xs text-slate-400 dark:text-slate-500">yoki URL kiriting:</p>
                      <input type="url" value={form.thumbnail_url} onChange={e => updateForm('thumbnail_url', e.target.value)} placeholder="https://example.com/image.jpg" className={inputCls} />
                    </div>
                    {/* Live preview */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-[#F26722]/20 via-[#FF8A4C]/10 to-slate-100 dark:to-slate-900">
                        {form.thumbnail_url ? <img src={form.thumbnail_url} alt={form.title || 'Preview'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><PhotoIcon className="h-12 w-12 text-slate-300 dark:text-slate-600" /></div>}
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex gap-2">
                          <span className="rounded-full bg-[#F26722]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F26722]">{form.is_paid ? 'Pullik' : 'Bepul'}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{LEVELS.find(l => l.value === form.level)?.label}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{form.title || 'Kurs nomi'}</p>
                        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{form.description || 'Kurs tavsifi...'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next step */}
              <button type="button" onClick={() => setStep('curriculum')} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17]">
                Davom etish <ChevronRightIcon className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* ────────────────────────────────────────────────────────────────
              STEP 2: CURRICULUM — sections & lessons
             ──────────────────────────────────────────────────────────────── */}
          {step === 'curriculum' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Curriculum</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{sections.length} modul · {totalLessons} dars</p>
                </div>
                <button type="button" onClick={addSection} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17]">
                  <PlusIcon className="h-3.5 w-3.5" /> Modul qo'shish
                </button>
              </div>

              {/* Sections */}
              <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragItem({ type: 'section', sectionId: section.id })}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragItem?.type === 'section') moveSection(dragItem.sectionId, section.id); if (dragItem?.type === 'lesson' && dragItem.lessonId) moveLesson(dragItem.sectionId, dragItem.lessonId, section.id); setDragItem(null) }}
                    className={`${cardCls} overflow-hidden transition-shadow hover:shadow-lg`}
                  >
                    {/* Section header */}
                    <div className="border-b border-slate-100 dark:border-slate-800/60 px-4 py-3 sm:px-5">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-9 w-9 cursor-grab items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-500 active:cursor-grabbing">
                          <ArrowsUpDownIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F26722]/10 text-[10px] font-bold text-[#F26722]">{sectionIndex + 1}</span>
                            <input value={section.title} onChange={e => updateSection(section.id, { title: e.target.value })} className="flex-1 border-0 bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" placeholder={`Modul ${sectionIndex + 1}`} />
                          </div>
                          <textarea value={section.description} onChange={e => updateSection(section.id, { description: e.target.value })} rows={1} className="w-full resize-none border-0 bg-transparent text-xs leading-relaxed text-slate-500 outline-none placeholder:text-slate-400 dark:text-slate-400" placeholder="Modul haqida qisqa izoh..." />
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => duplicateSection(section.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Duplicate">
                            <DocumentDuplicateIcon className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => removeSection(section.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400" title="O'chirish">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Lessons list */}
                    <div className="p-3 sm:p-4">
                      {section.lessons.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-700">
                          <BookOpenIcon className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Darslar qo'shilmagan</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {section.lessons.map((lesson, lessonIndex) => {
                            const meta = getLessonTypeMeta(lesson.type)
                            const LessonIcon = meta.icon
                            const active = selectedLesson?.lessonId === lesson.id
                            const ready = isLessonReady(lesson)
                            return (
                              <button
                                key={lesson.id}
                                type="button"
                                draggable
                                onDragStart={(e) => { e.stopPropagation(); setDragItem({ type: 'lesson', sectionId: section.id, lessonId: lesson.id }) }}
                                onDragOver={e => e.preventDefault()}
                                onDrop={(e) => { e.stopPropagation(); if (dragItem?.type === 'lesson' && dragItem.lessonId) moveLesson(dragItem.sectionId, dragItem.lessonId, section.id, lesson.id); setDragItem(null) }}
                                onClick={() => { setSelectedLesson({ sectionId: section.id, lessonId: lesson.id }); setMobileEditorOpen(true) }}
                                className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-[#F26722]/30 bg-[#F26722]/5 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30 dark:hover:border-slate-700'}`}
                              >
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.badge}`}>
                                  <LessonIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-slate-400">{lessonIndex + 1}.</span>
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{lesson.title || meta.label}</p>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                                    <span className={`rounded-full px-1.5 py-0.5 ${meta.badge}`}>{meta.label}</span>
                                    <span className={ready ? 'text-emerald-500' : 'text-slate-400'}>{ready ? '✓ Tayyor' : getLessonSyncLabel(lesson)}</span>
                                    {lesson.is_free && <span className="text-amber-500">👁 Preview</span>}
                                  </div>
                                </div>
                                <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-600" />
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Add lesson buttons */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(['video', 'material', 'quiz'] as LessonType[]).map(type => {
                          const meta = getLessonTypeMeta(type)
                          const Icon = meta.icon
                          return (
                            <button key={type} type="button" onClick={() => addLesson(section.id, type)} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-[#F26722]/30 hover:bg-[#F26722]/5 hover:text-[#F26722] dark:border-slate-700 dark:text-slate-400">
                              <Icon className="h-3.5 w-3.5" /> {meta.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Next/Prev buttons */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep('basics')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  <ArrowLeftIcon className="h-3.5 w-3.5" /> Asosiy
                </button>
                <button type="button" onClick={() => setStep('settings')} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17]">
                  Sozlamalar <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ────────────────────────────────────────────────────────────────
              STEP 3: SETTINGS — pricing, language, tags
             ──────────────────────────────────────────────────────────────── */}
          {step === 'settings' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Monetization */}
              <div className={`${cardCls} overflow-hidden`}>
                <div className="flex items-center justify-between bg-gradient-to-r from-amber-500/5 to-transparent px-5 py-4 dark:from-amber-500/10">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Monetizatsiya</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Free kurslar YouTube bilan, Paid kurslar video fayl yuklash orqali ishlaydi.</p>
                  </div>
                  <button type="button" onClick={() => updateForm('is_paid', !form.is_paid)} className={`relative h-7 w-12 rounded-full transition ${form.is_paid ? 'bg-[#F26722]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all ${form.is_paid ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Narx" icon={CurrencyDollarIcon} hint={form.is_paid ? "So'm da kiriting" : 'Bepul kurs'}>
                    <input type="number" value={form.price} onChange={e => updateForm('price', e.target.value)} disabled={!form.is_paid} className={`${inputCls} ${!form.is_paid ? 'opacity-50' : ''}`} min={0} step={1000} />
                  </Field>
                  <Field label="Til" icon={LanguageIcon}>
                    <select value={form.language} onChange={e => updateForm('language', e.target.value)} className={inputCls}>
                      {LANGUAGES.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Tags */}
              <div className={`${cardCls} overflow-hidden`}>
                <div className="bg-gradient-to-r from-blue-500/5 to-transparent px-5 py-4 dark:from-blue-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Teglar</p>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {form.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1.5 rounded-full bg-[#F26722]/10 px-3 py-1.5 text-xs font-semibold text-[#F26722]">
                        #{tag}
                        <button type="button" onClick={() => updateForm('tags', form.tags.filter(t => t !== tag))}>
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTagAdd() } }} className={`${inputCls} flex-1`} placeholder="Yangi teg yozing..." />
                    <button type="button" onClick={handleTagAdd} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-[#F26722]/10 hover:text-[#F26722] dark:bg-slate-800 dark:text-slate-300">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep('curriculum')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  <ArrowLeftIcon className="h-3.5 w-3.5" /> Curriculum
                </button>
                <button type="button" onClick={() => setStep('preview')} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17]">
                  Preview <EyeIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ────────────────────────────────────────────────────────────────
              STEP 4: PREVIEW — full course overview + validation
             ──────────────────────────────────────────────────────────────── */}
          {step === 'preview' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Metrics row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { icon: AcademicCapIcon, label: 'Status', value: form.is_published ? 'Published' : 'Draft', color: 'from-[#F26722]/10 to-amber-500/10' },
                  { icon: FilmIcon, label: 'Video', value: String(sections.reduce((s, sec) => s + sec.lessons.filter(l => l.type === 'video').length, 0)), color: 'from-blue-500/10 to-cyan-500/10' },
                  { icon: DocumentTextIcon, label: 'Material', value: String(sections.reduce((s, sec) => s + sec.lessons.filter(l => l.type === 'material').length, 0)), color: 'from-violet-500/10 to-fuchsia-500/10' },
                  { icon: QuestionMarkCircleIcon, label: 'Quiz', value: String(sections.reduce((s, sec) => s + sec.lessons.filter(l => l.type === 'quiz').length, 0)), color: 'from-amber-500/10 to-yellow-500/10' },
                ].map(m => (
                  <div key={m.label} className={`rounded-2xl border border-slate-200/80 bg-gradient-to-br ${m.color} p-3.5 dark:border-slate-800`}>
                    <m.icon className="h-4 w-4 text-[#F26722]" />
                    <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{m.value}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Validation card */}
              <div className={`${cardCls} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F26722]">Publish validation</p>
                {publishErrors.length === 0 ? (
                  <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Publish uchun tayyor ✓</p>
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Barcha majburiy maydonlar to'ldirilgan. Kursni publish qiling!</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900 dark:bg-red-900/20">
                    <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                      <ExclamationTriangleIcon className="h-4 w-4" /> Tekshirish kerak ({publishErrors.length})
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs text-red-600 dark:text-red-400">
                      {publishErrors.map(err => <li key={err} className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />{err}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Course structure preview */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Kurs tuzilmasi</h3>
                {sections.map((section, sIndex) => (
                  <div key={section.id} className={`${cardCls} overflow-hidden`}>
                    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800/60">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F26722]/10 text-xs font-bold text-[#F26722]">{sIndex + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{section.title || `Modul ${sIndex + 1}`}</p>
                        <p className="text-[11px] text-slate-400">{section.lessons.length} dars</p>
                      </div>
                    </div>
                    {section.lessons.length > 0 && (
                      <div className="divide-y divide-slate-50 dark:divide-slate-800/40">
                        {section.lessons.map((lesson, lIndex) => {
                          const meta = getLessonTypeMeta(lesson.type)
                          const LIcon = meta.icon
                          const ready = isLessonReady(lesson)
                          return (
                            <div key={lesson.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.badge}`}><LIcon className="h-3.5 w-3.5" /></div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-slate-900 dark:text-white">{lIndex + 1}. {lesson.title || meta.label}</p>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ready ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                {ready ? '✓' : '…'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Final action */}
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep('settings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  <ArrowLeftIcon className="h-3.5 w-3.5" /> Sozlamalar
                </button>
                <button type="button" onClick={() => saveCourse(false)} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-[#F26722]/30 hover:text-[#F26722] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Draft saqlash
                </button>
                <button type="button" onClick={() => saveCourse(true)} disabled={status === 'saving' || publishErrors.length > 0} className="inline-flex items-center gap-2 rounded-xl bg-[#F26722] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#F26722]/20 transition hover:bg-[#E05A17] disabled:opacity-50">
                  {status === 'saving' ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />} Publish course
                </button>
              </div>
            </motion.div>
          )}
        </main>

        {/* ── RIGHT PANEL — lesson editor (desktop always, mobile overlay) ── */}
        <aside className={`${step === 'curriculum' ? 'block' : 'hidden xl:block'}`}>
          {/* Mobile overlay */}
          <AnimatePresence>
            {mobileEditorOpen && lessonLookup && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setMobileEditorOpen(false)} />
            )}
          </AnimatePresence>

          <div className={`
            ${mobileEditorOpen && lessonLookup ? 'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 xl:static xl:z-auto xl:max-h-none xl:rounded-t-none xl:shadow-none' : 'hidden xl:block'}
            xl:sticky xl:top-16 xl:self-start
          `}>
            {lessonLookup ? (
              <div className="space-y-4 p-4 xl:rounded-2xl xl:border xl:border-slate-200/80 xl:bg-slate-50/70 xl:dark:border-slate-800 xl:dark:bg-slate-900/40">
                {/* Close on mobile */}
                <div className="flex items-center justify-between xl:hidden">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F26722]">Lesson editor</p>
                  <button type="button" onClick={() => setMobileEditorOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><XMarkIcon className="h-4 w-4" /></button>
                </div>
                <div className="hidden xl:block">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F26722]">Lesson editor</p>
                </div>

                {/* Lesson type selector */}
                <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
                  {(['video', 'material', 'quiz'] as LessonType[]).map(type => {
                    const meta = getLessonTypeMeta(type)
                    const Icon = meta.icon
                    const active = lessonLookup.lesson.type === type
                    return (
                      <button key={type} type="button" onClick={() => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { type, video_source: type === 'video' ? (lessonLookup.lesson.video_source === 'none' ? 'youtube' : lessonLookup.lesson.video_source) : 'none', status: 'draft' })} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition ${active ? 'bg-white text-[#F26722] shadow-sm dark:bg-slate-900' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}>
                        <Icon className="h-3.5 w-3.5" /> {meta.label.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>

                {/* Title & description */}
                <Field label="Sarlavha" required>
                  <input value={lessonLookup.lesson.title} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { title: e.target.value })} className={inputCls} placeholder="Dars sarlavhasi" />
                </Field>
                <Field label="Tavsif">
                  <textarea value={lessonLookup.lesson.description} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { description: e.target.value })} rows={3} className={`${inputCls} resize-none`} placeholder="Bu darsda nimalar o'rganiladi..." />
                </Field>

                {/* ── VIDEO EDITOR ── */}
                {lessonLookup.lesson.type === 'video' && (
                  <>
                    <Field label="Video" icon={CloudArrowUpIcon} hint={form.is_paid ? 'Pullik kurs — video yuklash tavsiya etiladi' : 'Bepul kurs — YouTube qulay'}>
                      <VideoSourcePicker
                        courseId={courseId}
                        source={lessonLookup.lesson.video_source}
                        videoUrl={lessonLookup.lesson.video_url}
                        bunnyVideoId={lessonLookup.lesson.bunny_video_id}
                        onSourceChange={source => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { video_source: source, video_url: '', bunny_video_id: '', status: 'draft' })}
                        onVideoChange={(url, durationSeconds, videoId) => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { video_url: url, bunny_video_id: videoId ?? lessonLookup.lesson.bunny_video_id, duration_minutes: durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : lessonLookup.lesson.duration_minutes, status: (url || videoId) ? 'ready' : 'draft' })}
                        disabled={status === 'saving'}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Davomiylik (daq.)" icon={FilmIcon}>
                        <input type="number" min={0} value={lessonLookup.lesson.duration_minutes} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { duration_minutes: Number(e.target.value) || 0 })} className={inputCls} />
                      </Field>
                      <Field label="Preview" icon={lessonLookup.lesson.is_free ? LockOpenIcon : LockClosedIcon}>
                        <button type="button" onClick={() => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { is_free: !lessonLookup.lesson.is_free })} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${lessonLookup.lesson.is_free ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
                          <span>{lessonLookup.lesson.is_free ? 'Ochiq' : 'Yopiq'}</span>
                          <div className={`h-5 w-9 rounded-full transition ${lessonLookup.lesson.is_free ? 'bg-[#F26722]' : 'bg-slate-300 dark:bg-slate-700'}`}><div className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition ${lessonLookup.lesson.is_free ? 'translate-x-[18px]' : 'translate-x-0.5'}`} /></div>
                        </button>
                      </Field>
                    </div>
                  </>
                )}

                {/* ── MATERIAL EDITOR ── */}
                {lessonLookup.lesson.type === 'material' && (
                  <>
                    <Field label="Material nomi" icon={DocumentTextIcon} hint="PDF, workbook yoki cheat sheet nomi">
                      <input value={lessonLookup.lesson.material_name} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { material_name: e.target.value, status: e.target.value || lessonLookup.lesson.material_url ? 'ready' : 'draft' })} className={inputCls} placeholder="React Performance Workbook.pdf" />
                    </Field>
                    <Field label="Fayl yuklash" icon={CloudArrowUpIcon} hint="PDF, DOC, PPTX yoki rasm yuklang">
                      <FileUploadWidget
                        accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*"
                        courseId={courseId}
                        folder="materials"
                        onUploaded={(url, name) => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { material_url: url, material_name: name || lessonLookup.lesson.material_name, status: url ? 'ready' : 'draft' })}
                        existingUrl={lessonLookup.lesson.material_url}
                        existingName={lessonLookup.lesson.material_name}
                        variant="document"
                        maxSizeMB={50}
                      />
                    </Field>
                    {!lessonLookup.lesson.material_url && (
                      <Field label="yoki URL kiriting" hint="Public CDN yoki cloud havolasini ulang">
                        <input value={lessonLookup.lesson.material_url} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { material_url: e.target.value, status: e.target.value ? 'ready' : 'draft' })} className={inputCls} placeholder="https://.../file.pdf" />
                      </Field>
                    )}
                  </>
                )}

                {/* ── QUIZ EDITOR ── */}
                {lessonLookup.lesson.type === 'quiz' && (
                  <QuizBuilder
                    questions={lessonLookup.lesson.quiz_questions}
                    onChange={qs => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { quiz_questions: qs, quiz_question_count: qs.length, status: qs.length > 0 ? 'ready' : 'draft' })}
                    disabled={status === 'saving'}
                  />
                )}

                {/* Delete lesson */}
                <button type="button" onClick={() => { removeLesson(lessonLookup.section.id, lessonLookup.lesson.id); setMobileEditorOpen(false) }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-900/20">
                  <TrashIcon className="h-3.5 w-3.5" /> Darsni o'chirish
                </button>
              </div>
            ) : (
              <div className="hidden xl:flex xl:min-h-[300px] xl:flex-col xl:items-center xl:justify-center xl:rounded-2xl xl:border xl:border-slate-200/80 xl:bg-slate-50/70 xl:p-6 xl:text-center xl:dark:border-slate-800 xl:dark:bg-slate-900/40">
                <PlayCircleIcon className="h-10 w-10 text-slate-200 dark:text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Lesson tanlang</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Chap tarafdan biror darsni bosing — editor shu yerda ochiladi.</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── DESKTOP-ONLY: Student preview sidebar ── */}
        {step !== 'curriculum' && (
          <aside className="hidden xl:block xl:sticky xl:top-16 xl:self-start">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F26722]">Student preview</p>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="aspect-video bg-gradient-to-br from-[#F26722]/20 via-[#FF8A4C]/10 to-slate-100 dark:to-slate-900">
                  {form.thumbnail_url ? <img src={form.thumbnail_url} alt="Preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><PhotoIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" /></div>}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex gap-1.5">
                    {form.tags.slice(0, 2).map(t => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">#{t}</span>)}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{form.title || 'Kurs nomi'}</p>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{sections.length} modul · {totalLessons} dars</span>
                    <span>{form.is_paid ? `${Number(form.price).toLocaleString()} so'm` : 'Bepul'}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </PageWrapper>
  )
}

export default CourseCreatePage
