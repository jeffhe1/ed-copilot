import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const CreateStudent = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  classId: z.string().optional(), // enroll immediately if provided
});

export async function POST(req: NextRequest) {
  try {
    const body = CreateStudent.parse(await req.json());

    // upsert to be idempotent on email (unique)
    const student = await prisma.student.upsert({
      where: { email: body.email },
      update: { name: body.name },
      create: { name: body.name, email: body.email },
    });

    // optional enrollment
    let enrollment: { id: string } | null = null;
    if (body.classId) {
      try {
        const e = await prisma.enrollment.upsert({
          where: { studentId_classId: { studentId: student.id, classId: body.classId } },
          update: {},
          create: { studentId: student.id, classId: body.classId },
          select: { id: true },
        });
        enrollment = e;
      } catch {
        // classId may be invalid—return a gentle warning but keep student
        return NextResponse.json({
          ok: true,
          student,
          warning: "Student created but classId was invalid; not enrolled.",
        });
      }
    }

    return NextResponse.json({ ok: true, student, enrollment });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid input", issues: err.issues }, { status: 400 });
    }
    console.error("students POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

/* Optional: GET /api/students?search=...&limit=... */
const GetQuery = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = GetQuery.parse(Object.fromEntries(searchParams.entries()));
    const where = q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }] }
      : {};

    const items = await prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: q.limit,
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, items });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid query params", issues: err.issues }, { status: 400 });
    }
    console.error("students GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
