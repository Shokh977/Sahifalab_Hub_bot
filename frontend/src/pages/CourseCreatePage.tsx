import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  Bars3Icon,
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
  HashtagIcon,
  InformationCircleIcon,
  LanguageIcon,
  ListBulletIcon,
  LockOpenIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlayCircleIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import PageWrapper from '../components/PageWrapper'
import VideoSourcePicker from '../components/VideoSourcePicker'
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
  material_url: string
  material_name: string
  quiz_question_count: number
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
  material_url: '',
  material_name: '',
  quiz_question_count: type === 'quiz' ? 5 : 0,
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
  if (lesson.type === 'video') return lesson.video_url ? 'Tayyor' : 'Video kutilmoqda'
  if (lesson.type === 'material') return lesson.material_url ? 'Material tayyor' : 'Material draft'
  return lesson.quiz_question_count > 0 ? 'Quiz draft' : 'Savollar kutilmoqda'
}

const isLessonReady = (lesson: BuilderLesson) => {
  if (!lesson.title.trim()) return false
  if (lesson.type === 'video') return !!lesson.video_url.trim()
  if (lesson.type === 'material') return !!lesson.material_url.trim() || !!lesson.material_name.trim()
  return lesson.quiz_question_count > 0
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

const StepPill: React.FC<{
  active: boolean
  completed: boolean
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  title: string
  description: string
  onClick: () => void
}> = ({ active, completed, icon: Icon, title, description, onClick }) => (
  <button type="button" onClick={onClick} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-[#F26722]/30 bg-[#F26722]/10 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-slate-800 bg-white/75 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:border-[#F26722]/20'}`}>
    <div className="flex items-start gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-[#F26722] text-white' : completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>
        {completed && !active ? <CheckCircleIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  </button>
)

const MetricCard: React.FC<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  value: string
  tone?: string
}> = ({ icon: Icon, label, value, tone = 'from-orange-500/10 to-amber-500/10' }) => (
  <div className={`rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br ${tone} p-4`}>
    <Icon className="h-5 w-5 text-[#F26722]" />
    <p className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
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
              type: 'video',
              status: 'synced',
              is_free: !!lesson.is_free,
              duration_minutes: lesson.duration_minutes ?? 0,
              video_source: (lesson.video_source ?? 'bunny') as 'youtube' | 'bunny' | 'none',
              video_url: '',
              material_url: '',
              material_name: '',
              quiz_question_count: 0,
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
        setMessage(err?.response?.data?.detail || 'Course studio yuklanmadi')
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
        lessons: section.lessons.map(lesson => ({ ...lesson, id: uid('lesson'), backendId: undefined, status: lesson.type === 'video' && lesson.video_url ? 'ready' : 'draft' })),
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

      const videoLessons = sections.flatMap(section => section.lessons.filter(lesson => lesson.type === 'video').map(lesson => ({ sectionId: section.id, lesson })))
      const keptIds = new Set(videoLessons.map(item => item.lesson.backendId).filter(Boolean) as number[])
      const deletedIds = knownBackendLessonIds.filter(existingId => !keptIds.has(existingId))
      for (const lessonId of deletedIds) await apiService.deleteLesson(lessonId)

      const backendIdMap = new Map<string, number>()
      const reordered: Array<{ id: number; order_index: number }> = []
      let orderIndex = 1

      for (const { lesson } of videoLessons) {
        const payload = {
          course_id: syncedCourseId,
          title: lesson.title.trim(),
          description: lesson.description.trim(),
          video_url: lesson.video_url,
          video_source: lesson.video_source,
          duration_minutes: lesson.duration_minutes,
          order_index: orderIndex,
          is_free: lesson.is_free,
        }

        if (lesson.backendId) {
          await apiService.updateLesson(lesson.backendId, payload)
          backendIdMap.set(lesson.id, lesson.backendId)
          reordered.push({ id: lesson.backendId, order_index: orderIndex })
        } else {
          const created = await apiService.createLesson(payload)
          const createdId = created.data?.id
          if (createdId) {
            backendIdMap.set(lesson.id, createdId)
            reordered.push({ id: createdId, order_index: orderIndex })
          }
        }

        orderIndex += 1
      }

      if (reordered.length) await apiService.reorderLessons(reordered)

      setSections(prev => prev.map(section => ({
        ...section,
        lessons: section.lessons.map(lesson => lesson.type !== 'video' ? lesson : {
          ...lesson,
          backendId: backendIdMap.get(lesson.id) ?? lesson.backendId,
          status: isLessonReady(lesson) ? 'synced' : 'draft',
        }),
      })))
      setKnownBackendLessonIds(reordered.map(item => item.id))
      setMessage(publish ? 'Kurs publish qilindi' : 'Draft saqlandi')
      setStatus('saved')
      setLastSavedAt(new Date().toISOString())

      if (!courseId && syncedCourseId) navigate(`/courses/${syncedCourseId}/edit`, { replace: true })
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Saqlashda xatolik yuz berdi'
      setMessage(typeof detail === 'string' ? detail : JSON.stringify(detail))
      setStatus('error')
    }
  }

  if (status === 'booting') {
    return (
      <PageWrapper className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-3">{[1,2,3,4].map(item => <div key={item} className="h-20 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-900" />)}</div>
          <div className="space-y-4">{[1,2,3].map(item => <div key={item} className="h-40 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-900" />)}</div>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper className="space-y-5" topPadding="py-5">
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start xl:top-6">
          <div className={`${cardCls} overflow-hidden`}>
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                <ArrowLeftIcon className="h-4 w-4" /> Ortga
              </button>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F26722] to-[#FFB347] text-white shadow-lg"><AcademicCapIcon className="h-6 w-6" /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F26722]">Course studio</p>
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white">{isEdit ? 'Kurs builder' : 'Yangi kurs yaratish'}</h1>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">Udemy uslubidagi, ammo yanada zamonaviy studio: modul, dars, narx, preview va publish oqimi bitta joyda.</p>
            </div>
            <div className="space-y-3 p-4">
              {STEP_ITEMS.map(item => <StepPill key={item.id} active={step === item.id} completed={stepCompletion[item.id]} icon={item.icon} title={item.title} description={item.description} onClick={() => setStep(item.id)} />)}
            </div>
          </div>

          <div className={`${cardCls} p-4`}>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={ListBulletIcon} label="Modullar" value={String(sections.length)} />
              <MetricCard icon={PlayCircleIcon} label="Darslar" value={String(totalLessons)} tone="from-blue-500/10 to-cyan-500/10" />
              <MetricCard icon={CheckCircleIcon} label="Tayyor" value={String(readyLessons)} tone="from-emerald-500/10 to-green-500/10" />
              <MetricCard icon={DocumentDuplicateIcon} label="Draft-only" value={String(draftOnlyCount)} tone="from-violet-500/10 to-fuchsia-500/10" />
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
              <p className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200"><InformationCircleIcon className="h-4 w-4 text-[#F26722]" /> Studio holati</p>
              <p className="mt-2">Video darslar platformaga live sync qilinadi. PDF va quiz bloklari builder draft sifatida saqlanadi va kelajakdagi native lesson renderer uchun tayyor turadi.</p>
              {lastSavedAt && <p className="mt-2 text-[11px] uppercase tracking-[0.16em]">Oxirgi autosave: {new Date(lastSavedAt).toLocaleString('uz-UZ')}</p>}
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} overflow-hidden`}>
            <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-800 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F26722]">Teacher-side builder</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{form.title || 'Premium kurs tajribasi yarating'}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">Modullarni boshqaring, dars turlarini ajrating, upload holatini ko‘ring va publishdan oldin kursni aynan talaba ko‘radigan strukturada preview qiling.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => saveCourse(false)} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#F26722]/30 hover:text-[#F26722] disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    {status === 'saving' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />} Draft saqlash
                  </button>
                  <button type="button" onClick={() => saveCourse(true)} disabled={status === 'saving'} className="inline-flex items-center gap-2 rounded-2xl bg-[#F26722] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(242,103,34,0.28)] transition hover:bg-[#E05A17] disabled:opacity-60">
                    {status === 'saving' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />} Publish course
                  </button>
                </div>
              </div>

              {(message || status === 'saved') && (
                <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${status === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>
                  <span className="inline-flex items-center gap-2">{status === 'error' ? <ExclamationTriangleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}{message || 'Saqlandi'}</span>
                </div>
              )}
            </div>

            <div className="space-y-6 px-5 py-5 sm:px-6">
              {step === 'basics' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="space-y-5">
                    <Field label="Kurs sarlavhasi" icon={AcademicCapIcon} required hint="Qisqa, aniq va premium ko‘rinadigan nom yozing.">
                      <input value={form.title} onChange={e => updateForm('title', e.target.value)} placeholder="Masalan: Modern React Course Studio" className={inputCls} maxLength={120} />
                    </Field>
                    <Field label="Tavsif" icon={DocumentTextIcon} required hint="Talabalar nimani o‘rganadi, kimlar uchun va natija qanday bo‘ladi — shuni yozing.">
                      <textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={7} placeholder="Kurs yakunida talabalar real loyiha yig‘a oladi, o‘z portfolio-sini boyitadi va zamonaviy stack bilan ishlashni o‘rganadi..." className={`${inputCls} resize-none`} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Kategoriya" icon={ListBulletIcon} required>
                        <select value={form.category_id} onChange={e => updateForm('category_id', e.target.value)} className={inputCls}>
                          <option value="">Kategoriya tanlang</option>
                          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Muqova rasmi" icon={PhotoIcon} required hint="Bunny CDN yoki boshqa public image URL dan foydalaning.">
                        <input type="url" value={form.thumbnail_url} onChange={e => updateForm('thumbnail_url', e.target.value)} placeholder="https://cdn.bunny.net/..." className={inputCls} />
                      </Field>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Live cover preview</p>
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                      <div className="aspect-[4/3] bg-gradient-to-br from-[#F26722] via-[#FF8A4C] to-[#2B2B2B]">
                        {form.thumbnail_url ? <img src={form.thumbnail_url} alt={form.title || 'Preview'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/85"><PhotoIcon className="h-16 w-16" /></div>}
                      </div>
                      <div className="space-y-3 p-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[#F26722]">Course card</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{form.title || 'Kurs nomi bu yerda ko‘rinadi'}</h3>
                        </div>
                        <p className="line-clamp-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{form.description || 'Qisqa tavsif kiriting — preview shu yerda yangilanadi.'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 'curriculum' && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Section-based builder</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Modullarni drag & drop bilan tartiblang, har bir modul ichida video, PDF va quiz bloklari yarating.</p>
                    </div>
                    <button type="button" onClick={addSection} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F26722] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#E05A17]"><PlusIcon className="h-4 w-4" /> Modul qo‘shish</button>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      {sections.map((section, sectionIndex) => (
                        <div key={section.id} draggable onDragStart={() => setDragItem({ type: 'section', sectionId: section.id })} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragItem?.type === 'section') moveSection(dragItem.sectionId, section.id); if (dragItem?.type === 'lesson' && dragItem.lessonId) moveLesson(dragItem.sectionId, dragItem.lessonId, section.id); setDragItem(null) }} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"><Bars3Icon className="h-5 w-5" /></div>
                              <div className="min-w-0 flex-1 space-y-3">
                                <input value={section.title} onChange={e => updateSection(section.id, { title: e.target.value })} className="w-full border-0 bg-transparent px-0 text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" placeholder={`Modul ${sectionIndex + 1}`} />
                                <textarea value={section.description} onChange={e => updateSection(section.id, { description: e.target.value })} rows={2} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 outline-none transition focus:border-[#F26722] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" placeholder="Modul uchun qisqa intro yozing" />
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <button type="button" onClick={() => duplicateSection(section.id)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#F26722]/30 hover:text-[#F26722] dark:border-slate-800 dark:text-slate-300"><DocumentDuplicateIcon className="h-4 w-4" /> Duplicate</button>
                              <button type="button" onClick={() => removeSection(section.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/10"><TrashIcon className="h-4 w-4" /> O‘chirish</button>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {(['video', 'material', 'quiz'] as LessonType[]).map(type => {
                              const meta = getLessonTypeMeta(type)
                              const Icon = meta.icon
                              return <button key={type} type="button" onClick={() => addLesson(section.id, type)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#F26722]/30 hover:bg-[#F26722]/5 dark:border-slate-800 dark:text-slate-200"><Icon className="h-4 w-4" /> {meta.label}</button>
                            })}
                          </div>

                          <div className="mt-4 space-y-3">
                            {section.lessons.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">Hali lesson yo‘q. Yuqoridagi tugmalardan biri bilan boshlang.</div>
                            ) : section.lessons.map(lesson => {
                              const meta = getLessonTypeMeta(lesson.type)
                              const Icon = meta.icon
                              const active = selectedLesson?.lessonId === lesson.id
                              return (
                                <button key={lesson.id} type="button" draggable onDragStart={() => setDragItem({ type: 'lesson', sectionId: section.id, lessonId: lesson.id })} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragItem?.type === 'lesson' && dragItem.lessonId) moveLesson(dragItem.sectionId, dragItem.lessonId, section.id, lesson.id); setDragItem(null) }} onClick={() => setSelectedLesson({ sectionId: section.id, lessonId: lesson.id })} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-[#F26722]/40 bg-[#F26722]/5 shadow-sm' : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700'}`}>
                                  <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${meta.badge}`}><Icon className="h-5 w-5" /></div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{lesson.title || meta.label}</p>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{getLessonSyncLabel(lesson)}</span>
                                      </div>
                                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{lesson.description || 'Lesson description yoki media maʼlumotlari shu yerda ko‘rinadi.'}</p>
                                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                                        {lesson.type === 'video' && <span className="inline-flex items-center gap-1"><FilmIcon className="h-3.5 w-3.5" /> {lesson.video_source === 'youtube' ? 'YouTube' : 'Bunny.net'}</span>}
                                        {lesson.type === 'material' && <span className="inline-flex items-center gap-1"><DocumentTextIcon className="h-3.5 w-3.5" /> {lesson.material_name || 'Material file'}</span>}
                                        {lesson.type === 'quiz' && <span className="inline-flex items-center gap-1"><QuestionMarkCircleIcon className="h-3.5 w-3.5" /> {lesson.quiz_question_count} savol</span>}
                                        <span className="inline-flex items-center gap-1"><LockOpenIcon className="h-3.5 w-3.5" /> {lesson.is_free ? 'Preview ochiq' : 'Faqat enrolled'}</span>
                                      </div>
                                    </div>
                                    <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40 xl:sticky xl:top-6 xl:self-start">
                      {lessonLookup ? (
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F26722]">Lesson editor</p>
                            <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{lessonLookup.lesson.title || 'Lesson sozlamalari'}</h3>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {(['video', 'material', 'quiz'] as LessonType[]).map(type => {
                              const meta = getLessonTypeMeta(type)
                              const Icon = meta.icon
                              const active = lessonLookup.lesson.type === type
                              return <button key={type} type="button" onClick={() => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { type, video_source: type === 'video' ? (lessonLookup.lesson.video_source === 'none' ? 'youtube' : lessonLookup.lesson.video_source) : 'none', status: 'draft' })} className={`rounded-2xl border px-3 py-3 text-xs font-semibold transition ${active ? 'border-[#F26722]/30 bg-[#F26722]/10 text-[#F26722]' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}><Icon className="mx-auto mb-1 h-4 w-4" />{meta.label}</button>
                            })}
                          </div>

                          <Field label="Lesson sarlavhasi" required>
                            <input value={lessonLookup.lesson.title} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { title: e.target.value })} className={inputCls} placeholder="Masalan: Hook architecture deep dive" />
                          </Field>
                          <Field label="Qisqa tavsif">
                            <textarea value={lessonLookup.lesson.description} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { description: e.target.value })} rows={4} className={`${inputCls} resize-none`} placeholder="Lesson ichida nimalar bo‘lishini tushuntiring" />
                          </Field>

                          {lessonLookup.lesson.type === 'video' && (
                            <>
                              <Field label="Video source" icon={CloudArrowUpIcon} hint={form.is_paid ? 'Pullik kurslar uchun Bunny.net tavsiya etiladi.' : 'Bepul kurslar uchun YouTube unlisted varianti qulay.'}>
                                <VideoSourcePicker
                                  courseId={courseId}
                                  source={lessonLookup.lesson.video_source}
                                  videoUrl={lessonLookup.lesson.video_url}
                                  onSourceChange={source => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { video_source: source, video_url: '', status: 'draft' })}
                                  onVideoChange={(url, durationSeconds) => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { video_url: url, duration_minutes: durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : lessonLookup.lesson.duration_minutes, status: url ? 'ready' : 'draft' })}
                                  disabled={status === 'saving'}
                                />
                              </Field>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Davomiylik (daq.)" icon={FilmIcon}><input type="number" min={0} value={lessonLookup.lesson.duration_minutes} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { duration_minutes: Number(e.target.value) || 0 })} className={inputCls} /></Field>
                                <Field label="Ko‘rinish turi" icon={LockOpenIcon}>
                                  <button type="button" onClick={() => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { is_free: !lessonLookup.lesson.is_free })} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${lessonLookup.lesson.is_free ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'}`}>
                                    <span>{lessonLookup.lesson.is_free ? 'Preview ochiq' : 'Faqat enrolled'}</span>
                                    <div className={`h-6 w-11 rounded-full transition ${lessonLookup.lesson.is_free ? 'bg-[#F26722]' : 'bg-slate-300 dark:bg-slate-700'}`}><div className={`mt-0.5 h-5 w-5 rounded-full bg-white shadow transition ${lessonLookup.lesson.is_free ? 'translate-x-[22px]' : 'translate-x-0.5'}`} /></div>
                                  </button>
                                </Field>
                              </div>
                            </>
                          )}

                          {lessonLookup.lesson.type === 'material' && (
                            <>
                              <Field label="Material nomi" icon={DocumentTextIcon} hint="Masalan: PDF workbook, cheat sheet yoki project files."><input value={lessonLookup.lesson.material_name} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { material_name: e.target.value, status: e.target.value || lessonLookup.lesson.material_url ? 'ready' : 'draft' })} className={inputCls} placeholder="React Performance Workbook.pdf" /></Field>
                              <Field label="Material URL" icon={CloudArrowUpIcon} hint="Bunny.net, Supabase yoki public CDN havolasini ulang."><input value={lessonLookup.lesson.material_url} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { material_url: e.target.value, status: e.target.value || lessonLookup.lesson.material_name ? 'ready' : 'draft' })} className={inputCls} placeholder="https://.../workbook.pdf" /></Field>
                              <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-xs leading-relaxed text-violet-700 dark:border-violet-900/60 dark:bg-violet-900/20 dark:text-violet-300">Material lessonlar hozircha studio draft sifatida preview qilinadi. Student-facing renderer ulanganida shu data bilan ishlaydi.</div>
                            </>
                          )}

                          {lessonLookup.lesson.type === 'quiz' && (
                            <>
                              <Field label="Savollar soni" icon={QuestionMarkCircleIcon} hint="Builder preview uchun minimal quiz info."><input type="number" min={0} value={lessonLookup.lesson.quiz_question_count} onChange={e => updateLesson(lessonLookup.section.id, lessonLookup.lesson.id, { quiz_question_count: Number(e.target.value) || 0, status: Number(e.target.value) > 0 ? 'ready' : 'draft' })} className={inputCls} /></Field>
                              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">Quiz blocklar course studio ichida modellashtiriladi. Backend quiz endpointiga ulanadigan keyingi iteratsiya uchun struktura tayyor.</div>
                            </>
                          )}

                          <button type="button" onClick={() => removeLesson(lessonLookup.section.id, lessonLookup.lesson.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/10"><TrashIcon className="h-4 w-4" /> Lessonni o‘chirish</button>
                        </div>
                      ) : (
                        <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
                          <PlayCircleIcon className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                          <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">Lesson tanlang</p>
                          <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">Chap tarafdan biror lesson kartasini tanlasangiz, shu yerda to‘liq editor ochiladi.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 'settings' && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Til" icon={LanguageIcon}><select value={form.language} onChange={e => updateForm('language', e.target.value)} className={inputCls}>{LANGUAGES.map(language => <option key={language.value} value={language.value}>{language.label}</option>)}</select></Field>
                      <Field label="Daraja" icon={GlobeAltIcon}><select value={form.level} onChange={e => updateForm('level', e.target.value)} className={inputCls}>{LEVELS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</select></Field>
                    </div>

                    <div className={`${cardCls} p-5`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">Monetization</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Free kurslar YouTube video bilan ochiq preview bera oladi. Paid kurslar uchun Bunny.net tavsiya etiladi.</p>
                        </div>
                        <button type="button" onClick={() => updateForm('is_paid', !form.is_paid)} className={`relative h-7 w-12 rounded-full transition ${form.is_paid ? 'bg-[#F26722]' : 'bg-slate-300 dark:bg-slate-700'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.is_paid ? 'left-6' : 'left-1'}`} /></button>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="Narx" icon={CurrencyDollarIcon} hint={form.is_paid ? 'So‘m ko‘rinishida kiriting.' : 'Bepul kurs uchun 0 bo‘lib qoladi.'}><input type="number" value={form.price} onChange={e => updateForm('price', e.target.value)} disabled={!form.is_paid} className={`${inputCls} ${!form.is_paid ? 'opacity-60' : ''}`} min={0} step={1000} /></Field>
                        <Field label="Publish status" icon={SparklesIcon}><button type="button" onClick={() => updateForm('is_published', !form.is_published)} className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold transition ${form.is_published ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200'}`}><span>{form.is_published ? 'Publish tayyor' : 'Draft holatda'}</span><CheckCircleIcon className="h-4 w-4" /></button></Field>
                      </div>
                    </div>

                    <Field label="Teglar" icon={HashtagIcon} hint="UI/UX, React, Design System kabi search-friendly teglar qo‘shing.">
                      <div className="rounded-[26px] border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex flex-wrap gap-2">
                          {form.tags.map(tag => <span key={tag} className="inline-flex items-center gap-2 rounded-full bg-[#F26722]/10 px-3 py-1.5 text-xs font-semibold text-[#F26722]">#{tag}<button type="button" onClick={() => updateForm('tags', form.tags.filter(item => item !== tag))}><TrashIcon className="h-3.5 w-3.5" /></button></span>)}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTagAdd() } }} className="flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white" placeholder="Yangi teg yozing va Enter bosing" />
                          <button type="button" onClick={handleTagAdd} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"><PlusIcon className="h-4 w-4" /> Qo‘shish</button>
                        </div>
                      </div>
                    </Field>
                  </div>

                  <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F26722]">Strategic notes</p>
                    <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      <p className="flex gap-2"><CloudArrowUpIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#F26722]" /> Video upload status video editor ichida ko‘rinadi va sync paytida backend lessonlarga yoziladi.</p>
                      <p className="flex gap-2"><DocumentTextIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#F26722]" /> Material va quiz bloklari builder draft sifatida saqlanadi — native mobile flow uchun tayyor data modeli sifatida ishlaydi.</p>
                      <p className="flex gap-2"><EyeIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#F26722]" /> Preview step orqali publishdan oldin to‘liq tuzilmani tekshirib chiqing.</p>
                    </div>
                  </div>
                </div>
              )}

              {step === 'preview' && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={AcademicCapIcon} label="Course status" value={form.is_published ? 'Published' : 'Draft'} />
                    <MetricCard icon={FilmIcon} label="Video lessons" value={String(sections.reduce((sum, section) => sum + section.lessons.filter(lesson => lesson.type === 'video').length, 0))} tone="from-blue-500/10 to-cyan-500/10" />
                    <MetricCard icon={DocumentTextIcon} label="Materials" value={String(sections.reduce((sum, section) => sum + section.lessons.filter(lesson => lesson.type === 'material').length, 0))} tone="from-violet-500/10 to-fuchsia-500/10" />
                    <MetricCard icon={QuestionMarkCircleIcon} label="Quizzes" value={String(sections.reduce((sum, section) => sum + section.lessons.filter(lesson => lesson.type === 'quiz').length, 0))} tone="from-amber-500/10 to-yellow-500/10" />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-4">
                      {sections.map((section, index) => (
                        <div key={section.id} className="rounded-[28px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/70">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F26722]/10 text-[#F26722] font-semibold">{index + 1}</div>
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{section.title || `Modul ${index + 1}`}</h3>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{section.description || 'Qisqa modul intro kiritilmagan.'}</p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            {section.lessons.map((lesson, lessonIndex) => {
                              const meta = getLessonTypeMeta(lesson.type)
                              const Icon = meta.icon
                              return (
                                <div key={lesson.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${meta.badge}`}><Icon className="h-5 w-5" /></div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{lessonIndex + 1}. {lesson.title || meta.label}</p>
                                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${meta.badge}`}>{meta.label}</span>
                                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{getLessonSyncLabel(lesson)}</span>
                                    </div>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{lesson.description || 'No lesson description yet.'}</p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/40 xl:sticky xl:top-6 xl:self-start">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F26722]">Validation</p>
                      {publishErrors.length === 0 ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300"><p className="inline-flex items-center gap-2 font-semibold"><CheckCircleIcon className="h-4 w-4" /> Publish uchun tayyor</p><p className="mt-2 text-xs leading-relaxed">Asosiy maydonlar to‘ldirilgan. Endi kursni draft yoki publish rejimida saqlashingiz mumkin.</p></div>
                      ) : (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300"><p className="inline-flex items-center gap-2 font-semibold"><ExclamationTriangleIcon className="h-4 w-4" /> Tekshirish kerak</p><ul className="mt-3 space-y-2 text-xs leading-relaxed">{publishErrors.map(error => <li key={error}>• {error}</li>)}</ul></div>
                      )}

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Preview snapshot</p>
                        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                          <div className="aspect-[16/9] bg-gradient-to-br from-[#F26722] via-[#FF9F67] to-[#1E293B]">{form.thumbnail_url ? <img src={form.thumbnail_url} alt={form.title || 'Course'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/80"><PhotoIcon className="h-16 w-16" /></div>}</div>
                          <div className="space-y-3 p-4">
                            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#F26722]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F26722]">{form.is_paid ? 'Paid course' : 'Free course'}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{form.language.toUpperCase()}</span></div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{form.title || 'Course title'}</h3>
                            <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{form.description || 'Course description preview'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </main>

        <aside className="hidden xl:block xl:sticky xl:top-6 xl:self-start">
          <div className={`${cardCls} overflow-hidden`}>
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F26722]">Student preview</p>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">Mini layout</h3>
            </div>
            <div className="p-4">
              <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div className="aspect-[4/3] bg-gradient-to-br from-[#F26722] via-[#FF8A4C] to-[#1E293B]">{form.thumbnail_url ? <img src={form.thumbnail_url} alt={form.title || 'Preview'} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/80"><PhotoIcon className="h-16 w-16" /></div>}</div>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap gap-2">{(form.tags.length ? form.tags.slice(0, 3) : ['education', 'course']).map(tag => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">#{tag}</span>)}</div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">{form.title || 'Kurs preview'}</h4>
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>{sections.length} modul</span><span>{totalLessons} lesson</span></div>
                  <button type="button" onClick={() => setStep('preview')} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#F26722] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#E05A17]"><EyeIcon className="h-4 w-4" /> Full preview</button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </PageWrapper>
  )
}

export default CourseCreatePage
