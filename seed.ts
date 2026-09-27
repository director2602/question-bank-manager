/**
 * Seeds the database with:
 *   1. Lookup tables (roles, subjects, exam classes, codes, difficulty levels)
 *   2. 9 demo user accounts — the org's standard model: exactly ONE Owner
 *      (full admin rights) and EIGHT standard Users — satisfying the
 *      "at least 9 concurrent users" requirement out of the box.
 *   3. 100+ sample questions spread across a range of tag combinations,
 *      including the exact combination used in the acceptance test
 *      (Physics / 11 JEE / Code A: Easy/Medium/Difficult) with enough
 *      volume to generate a 20-question paper (5 Easy + 10 Medium + 5
 *      Difficult) more than once without exhausting the bank.
 *
 * Run with: npm run db:seed  (after `npx prisma migrate deploy` and the
 * supabase/sql/*.sql scripts — see README.md § Getting Started).
 *
 * Idempotent: safe to re-run. Lookup rows and demo users are upserted;
 * demo questions are only inserted if the bank is empty, so re-running the
 * seed after real data has been added will not duplicate anything.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { SUBJECTS, EXAM_CLASSES, CODES, DIFFICULTY_LEVELS, EXAM_CATEGORIES, ROLES, CHAPTERS_SEED } from '../src/lib/constants'

const prisma = new PrismaClient()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEMO_PASSWORD = 'Passw0rd!2026'

type DemoUser = { email: string; fullName: string; role: 'ADMIN' | 'EDITOR' }

const DEMO_USERS: DemoUser[] = [
  { email: 'owner@qbank.demo', fullName: 'Priya Sharma (Owner)', role: 'ADMIN' },
  { email: 'user1@qbank.demo', fullName: 'Arjun Mehta', role: 'EDITOR' },
  { email: 'user2@qbank.demo', fullName: 'Kavya Nair', role: 'EDITOR' },
  { email: 'user3@qbank.demo', fullName: 'Rohan Gupta', role: 'EDITOR' },
  { email: 'user4@qbank.demo', fullName: 'Sneha Iyer', role: 'EDITOR' },
  { email: 'user5@qbank.demo', fullName: 'Vikram Rao', role: 'EDITOR' },
  { email: 'user6@qbank.demo', fullName: 'Anjali Desai', role: 'EDITOR' },
  { email: 'user7@qbank.demo', fullName: 'Karthik Reddy', role: 'EDITOR' },
  { email: 'user8@qbank.demo', fullName: 'Meera Joshi', role: 'EDITOR' },
]

async function seedLookups() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label, description: role.description },
      create: { code: role.code, label: role.label, description: role.description },
    })
  }
  for (const s of SUBJECTS) {
    await prisma.subject.upsert({ where: { code: s.code }, update: { label: s.label, sortOrder: s.sortOrder }, create: s })
  }
  for (const c of EXAM_CLASSES) {
    await prisma.examClass.upsert({ where: { code: c.code }, update: { label: c.label, sortOrder: c.sortOrder }, create: c })
  }
  for (const c of CODES) {
    await prisma.code.upsert({ where: { code: c.code }, update: { label: c.label, sortOrder: c.sortOrder }, create: c })
  }
  for (const d of DIFFICULTY_LEVELS) {
    await prisma.difficultyLevel.upsert({ where: { code: d.code }, update: { label: d.label, sortOrder: d.sortOrder }, create: d })
  }
  for (const e of EXAM_CATEGORIES) {
    await prisma.examCategory.upsert({ where: { code: e.code }, update: { label: e.label, sortOrder: e.sortOrder }, create: e })
  }
  console.log('✓ Lookup tables seeded (roles, subjects, exam classes, codes, difficulty levels, exam categories)')
}

/**
 * Seeds Chapters (scoped to Subject) and Topics (scoped to Chapter) for the
 * Advanced Paper Builder's chapter/topic selection. Idempotent via upsert on
 * the (subjectId, code) / (chapterId, code) unique constraints, same as
 * every other lookup above.
 */
async function seedChaptersAndTopics() {
  const subjects = await prisma.subject.findMany()
  const subjectIdByCode = new Map(subjects.map((s) => [s.code, s.id]))

  let chapterCount = 0
  let topicCount = 0
  for (const [subjectCode, chapters] of Object.entries(CHAPTERS_SEED)) {
    const subjectId = subjectIdByCode.get(subjectCode)
    if (!subjectId) continue
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i]
      const chapter = await prisma.chapter.upsert({
        where: { subjectId_code: { subjectId, code: ch.code } },
        update: { label: ch.label, sortOrder: i },
        create: { subjectId, code: ch.code, label: ch.label, sortOrder: i },
      })
      chapterCount += 1
      for (let j = 0; j < ch.topics.length; j++) {
        const t = ch.topics[j]
        await prisma.topic.upsert({
          where: { chapterId_code: { chapterId: chapter.id, code: t.code } },
          update: { label: t.label, sortOrder: j },
          create: { chapterId: chapter.id, code: t.code, label: t.label, sortOrder: j },
        })
        topicCount += 1
      }
    }
  }
  console.log(`✓ Chapters/Topics seeded (${chapterCount} chapters, ${topicCount} topics)`)
}

async function seedDemoUsers(): Promise<Record<string, string>> {
  const idByEmail: Record<string, string> = {}

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn(
      '⚠ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping demo auth user creation.\n' +
        '  Set them in .env and re-run `npm run db:seed` to create the 1 Owner + 8 User demo accounts.'
    )
    return idByEmail
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const roles = await prisma.role.findMany()
  const roleIdByCode = new Map(roles.map((r) => [r.code, r.id]))

  for (const demo of DEMO_USERS) {
    // Look up an existing auth user by email (Supabase has no direct
    // getUserByEmail in the admin API, so we page through — the user list
    // here is always tiny).
    let userId: string | undefined
    let page = 1
    while (!userId) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      const found = data.users.find((u) => u.email?.toLowerCase() === demo.email.toLowerCase())
      if (found) userId = found.id
      if (data.users.length < 200) break
      page += 1
    }

    if (!userId) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: demo.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: demo.fullName },
      })
      if (error) throw error
      userId = data.user.id
    }

    idByEmail[demo.email] = userId

    const roleId = roleIdByCode.get(demo.role)!
    await prisma.profile.upsert({
      where: { id: userId },
      update: { email: demo.email, fullName: demo.fullName, roleId, isActive: true },
      create: { id: userId, email: demo.email, fullName: demo.fullName, roleId, isActive: true },
    })
  }

  console.log(`✓ Demo users ready: 1 Owner + ${DEMO_USERS.length - 1} Users (password: ${DEMO_PASSWORD})`)
  return idByEmail
}

// ── Synthetic question content generator ───────────────────────────────
// Produces plausible-looking (clearly synthetic) MCQ content per subject so
// the demo bank has 100+ realistic rows without hand-authoring each one.

const TOPIC_BANK: Record<string, string[]> = {
  PHYSICS: ['kinematics', 'Newton’s laws', 'work and energy', 'rotational motion', 'gravitation', 'thermodynamics', 'electrostatics', 'current electricity', 'magnetism', 'optics', 'modern physics', 'oscillations'],
  CHEMISTRY: ['atomic structure', 'chemical bonding', 'thermochemistry', 'equilibrium', 'electrochemistry', 'organic reaction mechanisms', 'periodic properties', 'coordination compounds', 'solutions', 'kinetics'],
  ZOOLOGY: ['animal tissues', 'human physiology', 'circulatory system', 'nervous system', 'reproduction', 'genetics', 'evolution', 'animal classification'],
  BOTANY: ['plant anatomy', 'photosynthesis', 'plant reproduction', 'plant hormones', 'transpiration', 'plant classification', 'cell biology', 'genetics'],
  MATH: ['algebra', 'calculus', 'coordinate geometry', 'trigonometry', 'probability', 'matrices', 'sequences and series', 'vectors'],
  MAT: ['logical reasoning', 'verbal ability', 'data interpretation', 'quantitative aptitude', 'analytical reasoning'],
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildQuestion(subjectCode: string, index: number, rand: () => number) {
  const topics = TOPIC_BANK[subjectCode] ?? ['general concepts']
  const topic = topics[Math.floor(rand() * topics.length)]
  const variant = Math.floor(rand() * 4)

  const templates = [
    `Which of the following statements about ${topic} is correct?`,
    `A problem based on ${topic}: identify the correct relationship among the given quantities.`,
    `Consider the concept of ${topic}. Which option best explains the underlying principle?`,
    `In the context of ${topic}, which of the given options represents the correct conclusion?`,
  ]

  const questionText = `${templates[variant]} (Reference Q${index})`
  const options = ['A', 'B', 'C', 'D'].map((letter) => `Option ${letter} — a plausible statement about ${topic} (#${index})`)
  const correctAnswer = ['A', 'B', 'C', 'D'][Math.floor(rand() * 4)]
  const explanation = `This tests understanding of ${topic}. The correct choice follows directly from the standard definition/derivation covered in the syllabus.`

  return { questionText, options, correctAnswer, explanation }
}

type SeedLine = { subjectCode: string; classCode: string; codeCode: string; difficultyCode: string; count: number }

// Generous coverage of the acceptance-test combinations, plus lighter
// coverage across the rest of the matrix so every Dashboard chart has data.
const SEED_LINES: SeedLine[] = [
  { subjectCode: 'PHYSICS', classCode: 'CLASS_11_JEE', codeCode: 'A', difficultyCode: 'E', count: 15 },
  { subjectCode: 'PHYSICS', classCode: 'CLASS_11_JEE', codeCode: 'A', difficultyCode: 'M', count: 20 },
  { subjectCode: 'PHYSICS', classCode: 'CLASS_11_JEE', codeCode: 'A', difficultyCode: 'D', count: 12 },
  { subjectCode: 'CHEMISTRY', classCode: 'CLASS_11_NEET', codeCode: 'B', difficultyCode: 'M', count: 15 },
  { subjectCode: 'BOTANY', classCode: 'CLASS_10_NEET', codeCode: 'C', difficultyCode: 'E', count: 15 },
  { subjectCode: 'ZOOLOGY', classCode: 'CLASS_10_NEET', codeCode: 'C', difficultyCode: 'E', count: 8 },
  { subjectCode: 'MATH', classCode: 'CLASS_10_JEE', codeCode: 'D', difficultyCode: 'D', count: 15 },
  { subjectCode: 'MATH', classCode: 'CLASS_9', codeCode: 'A', difficultyCode: 'E', count: 6 },
  { subjectCode: 'PHYSICS', classCode: 'CLASS_9', codeCode: 'B', difficultyCode: 'M', count: 6 },
  { subjectCode: 'CHEMISTRY', classCode: 'CLASS_8', codeCode: 'A', difficultyCode: 'E', count: 5 },
  { subjectCode: 'MAT', classCode: 'CLASS_7', codeCode: 'A', difficultyCode: 'E', count: 5 },
  { subjectCode: 'PHYSICS', classCode: 'CLASS_11_NEET', codeCode: 'C', difficultyCode: 'M', count: 6 },
  { subjectCode: 'CHEMISTRY', classCode: 'CLASS_10_JEE', codeCode: 'D', difficultyCode: 'E', count: 6 },
]

async function seedQuestions(creatorIdByEmail: Record<string, string>) {
  const existingCount = await prisma.question.count()
  if (existingCount > 0) {
    console.log(`✓ Question bank already has ${existingCount} question(s) — skipping demo question seed.`)
    return
  }

  const creatorId = Object.values(creatorIdByEmail)[0]
  if (!creatorId) {
    console.warn('⚠ No demo user available to attribute seeded questions to — skipping question seed (create users first).')
    return
  }

  const [subjects, examClasses, codes, difficulties, chapters] = await Promise.all([
    prisma.subject.findMany(),
    prisma.examClass.findMany(),
    prisma.code.findMany(),
    prisma.difficultyLevel.findMany(),
    prisma.chapter.findMany({ include: { topics: true } }),
  ])
  const subjectId = Object.fromEntries(subjects.map((s) => [s.code, s.id]))
  const classId = Object.fromEntries(examClasses.map((s) => [s.code, s.id]))
  const codeId = Object.fromEntries(codes.map((s) => [s.code, s.id]))
  const difficultyId = Object.fromEntries(difficulties.map((s) => [s.code, s.id]))
  const chaptersBySubjectId = new Map<string, typeof chapters>()
  for (const ch of chapters) {
    const list = chaptersBySubjectId.get(ch.subjectId) ?? []
    list.push(ch)
    chaptersBySubjectId.set(ch.subjectId, list)
  }

  const rand = mulberry32(42)
  let globalIndex = 1
  let created = 0

  for (const line of SEED_LINES) {
    for (let i = 1; i <= line.count; i++) {
      const { questionText, options, correctAnswer, explanation } = buildQuestion(line.subjectCode, globalIndex, rand)

      // Tag a real chapter/topic when one is available for this subject, so
      // the Advanced Paper Builder's chapter/topic filters have real demo
      // data to select against — never fabricated, just a deterministic
      // pick from the actual seeded chapters/topics for that subject.
      const subjectChapters = chaptersBySubjectId.get(subjectId[line.subjectCode]!) ?? []
      const chapter = subjectChapters.length > 0 ? subjectChapters[Math.floor(rand() * subjectChapters.length)] : null
      const topic = chapter && chapter.topics.length > 0 ? chapter.topics[Math.floor(rand() * chapter.topics.length)] : null

      const question = await prisma.question.create({
        data: {
          questionNumber: String(i),
          subjectId: subjectId[line.subjectCode]!,
          examClassId: classId[line.classCode]!,
          codeId: codeId[line.codeCode]!,
          difficultyId: difficultyId[line.difficultyCode]!,
          questionType: 'MCQ',
          chapterId: chapter?.id,
          topicId: topic?.id,
          createdById: creatorId,
        },
      })
      const version = await prisma.questionVersion.create({
        data: {
          questionId: question.id,
          versionNumber: 1,
          questionText,
          optionA: options[0],
          optionB: options[1],
          optionC: options[2],
          optionD: options[3],
          correctAnswer,
          explanation,
          changeNote: 'Seeded demo question',
          createdById: creatorId,
        },
      })
      await prisma.question.update({ where: { id: question.id }, data: { currentVersionId: version.id } })

      globalIndex += 1
      created += 1
    }
  }

  console.log(`✓ Seeded ${created} demo questions across ${SEED_LINES.length} tag combinations.`)
}

async function seedPaperTemplate() {
  const existing = await prisma.paperTemplate.findFirst({ where: { isDefault: true } })
  if (existing) return
  await prisma.paperTemplate.create({
    data: {
      name: 'CUBUS Default',
      instituteName: 'CUBUS',
      logoUrl: '/branding/cubus-logo.png',
      headerText: 'समर्पण · सुनिश्चित · सफलता',
      footerText: 'CUBUS — NEET · IIT-JEE · Foundation',
      instructions: 'Answer all questions. Each question carries equal marks unless stated otherwise.',
      isDefault: true,
    },
  })
  console.log('✓ Default CUBUS paper template seeded.')
}

async function main() {
  await seedLookups()
  await seedChaptersAndTopics()
  const creatorIdByEmail = await seedDemoUsers()
  await seedQuestions(creatorIdByEmail)
  await seedPaperTemplate()
  console.log('\nSeed complete.')
  if (Object.keys(creatorIdByEmail).length > 0) {
    console.log(`Sign in as the Owner with: ${DEMO_USERS[0].email} / ${DEMO_PASSWORD}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
