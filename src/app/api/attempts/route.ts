// app/api/attempts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { updateMastery } from "@/lib/mastery";

/* ========================== Zod Schemas ========================== */

const AttemptBody = z.object({
  studentId: z.string().min(1),
  questionId: z.string().min(1),

  // Option A: provide correctness directly
  correct: z.boolean().optional(),

  // Option B: let API derive correctness from MCQ labels
  selected: z.enum(["A", "B", "C", "D"]).optional(),
  correctOption: z.enum(["A", "B", "C", "D"]).optional(),

  // Optional telemetry
  skillIds: z.array(z.string()).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  timeTakenMs: z.number().int().min(0).optional(),
});

const GetQuery = z.object({
  studentId: z.string().min(1).optional(),
  questionId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  skillId: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
  correct: z
    .enum(["true", "false"])
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined))
    .optional(),
  dateFrom: z.string().datetime().optional(), // ISO
  dateTo: z.string().datetime().optional(),   // ISO
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  // Pagination
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().optional(), // attempt.id
  offset: z.coerce.number().int().min(0).optional(), // fallback pagination
});

/* ============================ POST ============================ */

export async function POST(req: NextRequest) {
  try {
    const body = AttemptBody.parse(await req.json());

    // Fetch question to snapshot classification and linked skills
  const question = await prisma.question.findUnique({
    where: { id: body.questionId },
    include: { qSkills: true }, // no klass needed
  });
    if (!question) {
      return NextResponse.json(
        { ok: false, error: "Question not found." },
        { status: 404 }
      );
    }

    // Determine correctness
    let isCorrect: boolean | undefined = body.correct;
    if (typeof isCorrect !== "boolean" && body.selected && body.correctOption) {
      isCorrect = body.selected === body.correctOption;
    }
    if (typeof isCorrect !== "boolean") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing correctness. Provide `correct: boolean` or both `selected` and `correctOption`.",
        },
        { status: 400 }
      );
    }

    // Derive skillIds if not provided
    const derivedSkillIds =
      body.skillIds && body.skillIds.length > 0
        ? body.skillIds
        : question.qSkills.map((qs) => qs.skillId);

    // Pick difficulty: request > question.difficulty > undefined
    const difficulty =
      typeof body.difficulty === "number"
        ? body.difficulty
        : question.difficulty ?? undefined;

    // Create attempt (snapshots area/subject/topic)
    const attempt = await prisma.attempt.create({
      data: {
        studentId: body.studentId,
        questionId: body.questionId,
        correct: isCorrect,
        skillIds: derivedSkillIds,
        difficulty,
        timeTakenMs: body.timeTakenMs ?? null,
        area: question.area,
        subject: question.subject,
        topic: question.topic,
      },
      include: {
        question: {
          select: {
            id: true,
            prompt: true,
            area: true,
            subject: true,
            topic: true,
            difficulty: true,
            classId: true,
          },
        },
      },
    });

    // Update per-skill mastery (no-op if no skills)
    if (derivedSkillIds.length > 0) {
      await updateMastery({
        studentId: body.studentId,
        correct: isCorrect,
        skillIds: derivedSkillIds,
        difficulty,
      });
    }

    return NextResponse.json({
      ok: true,
      attempt,
      snapshot: {
        area: question.area,
        subject: question.subject,
        topic: question.topic,
        skillIds: derivedSkillIds,
        difficulty,
      },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", issues: err.issues },
        { status: 400 }
      );
    }
    console.error("attempts POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}

/* ============================= GET ============================= */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raw: Record<string, string> = {};
    searchParams.forEach((v, k) => (raw[k] = v));
    const q = GetQuery.parse(raw);

    // Build where clause
    const where: any = {};

    if (q.studentId) where.studentId = q.studentId;
    if (q.questionId) where.questionId = q.questionId;
    if (q.area) where.area = q.area;
    if (q.subject) where.subject = q.subject;
    if (q.topic) where.topic = q.topic;
    if (typeof q.correct === "boolean") where.correct = q.correct;

    // Date range
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }

    // Filter by skillId (array contains)
    if (q.skillId) {
      where.skillIds = { has: q.skillId };
    }

    // Filter by classId through relation
    const includeQuestion = !!q.classId;

    // Pagination strategy: cursor first, else offset
    const take = q.limit;
    const orderBy = { createdAt: q.order };

    if (q.cursor) {
      // cursor-based pagination
      const rows = await prisma.attempt.findMany({
        where,
        take,
        skip: 1, // skip the cursor itself
        cursor: { id: q.cursor },
        orderBy,
        include: {
          question: {
            select: {
              id: true,
              prompt: true,
              area: true,
              subject: true,
              topic: true,
              difficulty: true,
              classId: true,
            },
          },
        },
      });

      const filtered = includeQuestion && q.classId
        ? rows.filter((r) => r.question?.classId === q.classId)
        : rows;

      return NextResponse.json({
        ok: true,
        items: filtered,
        nextCursor: filtered.length === take ? filtered[filtered.length - 1].id : null,
      });
    }

    // offset pagination (useful for quick admin views)
    const skip = q.offset ?? 0;

    const rows = await prisma.attempt.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        question: {
          select: {
            id: true,
            prompt: true,
            area: true,
            subject: true,
            topic: true,
            difficulty: true,
            classId: true,
          },
        },
      },
    });

    const filtered = includeQuestion && q.classId
      ? rows.filter((r) => r.question?.classId === q.classId)
      : rows;

    // A tiny count when using offset (for UI pagination controls)
    const total = await prisma.attempt.count({ where });

    return NextResponse.json({
      ok: true,
      items: filtered,
      total,
      page: { skip, take, order: q.order },
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid query params", issues: err.issues },
        { status: 400 }
      );
    }
    console.error("attempts GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
