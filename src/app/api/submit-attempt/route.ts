// app/api/submit-attempt/route.ts
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type SubmitRow = {
  attemptId: string;
  questionId?: string;                // optional now
  chosen: string;                     // e.g. "A"
  expected: string;                   // e.g. "B"
  timeTakenMs?: number | null;
};

export async function POST(req: Request) {
  try {
    const { authUserId, submissions } = (await req.json()) as {
      authUserId?: string;
      submissions?: SubmitRow[];
    };

    if (!authUserId) {
      return NextResponse.json({ error: "Missing authUserId" }, { status: 400 });
    }
    if (!Array.isArray(submissions) || submissions.length === 0) {
      return NextResponse.json({ error: "No submissions" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { authUserId },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const results: Array<{ attemptId: string; correct: boolean; updated: number }> = [];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const row of submissions) {
        const attempt = await tx.attempt.findUnique({
          where: { id: row.attemptId },
          select: { id: true, studentId: true },
        });
        if (!attempt || attempt.studentId !== student.id) {
          // skip invalid/foreign attempts
          results.push({ attemptId: row.attemptId, correct: false, updated: 0 });
          continue;
        }

        const chosen = String(row.chosen).trim().toUpperCase();
        const expected = String(row.expected).trim().toUpperCase();
        const correct = chosen === expected;

        const upd = await tx.attempt.updateMany({
          where: { id: attempt.id, studentId: student.id },
          data: {
            correct,
            timeTakenMs: row.timeTakenMs ?? null,
          },
        });
        results.push({ attemptId: attempt.id, correct, updated: upd.count });
      }
    });

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("submit-attempt error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
