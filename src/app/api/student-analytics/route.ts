// app/api/student-analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Row = { subject: string; attempted: number; accuracy: number; mastery: number };

export async function POST(req: Request) {
  try {
    const { authUserId } = (await req.json()) as { authUserId?: string };
    if (!authUserId) {
      return NextResponse.json({ error: "Missing authUserId" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { authUserId },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json({ error: "Student not found for this authUserId" }, { status: 404 });
    }

    // 1) Group attempts by subject for totals
    const bySubjectTotals = await prisma.attempt.groupBy({
      by: ["subject"],
      where: { studentId: student.id },
      _count: { _all: true },
    });
    // 1b) Group attempts by subject where correct=true
    const bySubjectCorrect = await prisma.attempt.groupBy({
      by: ["subject"],
      where: { studentId: student.id, correct: true },
      _count: { _all: true },
    });

    // 2) For mastery, collect all (subject, questionId) pairs
    const subjQs = await prisma.attempt.findMany({
      where: { studentId: student.id },
      select: { subject: true, questionId: true },
    });

    // subject -> Set<questionId>
    const subjectToQids = new Map<string, Set<string>>();
    for (const r of subjQs) {
      if (!r.subject || !r.questionId) continue;
      if (!subjectToQids.has(r.subject)) subjectToQids.set(r.subject, new Set());
      subjectToQids.get(r.subject)!.add(r.questionId);
    }

    // Get all QuestionSkill rows for all questionIds at once
    const allQids = Array.from(new Set(subjQs.map((r) => r.questionId).filter(Boolean) as string[]));
    const qSkills = allQids.length
      ? await prisma.questionSkill.findMany({
          where: { questionId: { in: allQids } },
          select: { questionId: true, skillId: true },
        })
      : [];

    // questionId -> skillIds[]
    const qidToSkillIds = new Map<string, string[]>();
    for (const qs of qSkills) {
      const arr = qidToSkillIds.get(qs.questionId) ?? [];
      arr.push(qs.skillId);
      qidToSkillIds.set(qs.questionId, arr);
    }

    // Build subject -> Set<skillId> actually encountered
    const subjectToSkillIds = new Map<string, Set<string>>();
    for (const [subject, qids] of subjectToQids.entries()) {
      const set = new Set<string>();
      for (const qid of qids) {
        const ks = qidToSkillIds.get(qid);
        if (ks) ks.forEach((id) => set.add(id));
      }
      subjectToSkillIds.set(subject, set);
    }

    // Fetch all mastery rows for the union of all skillIds
    const allSkillIds = Array.from(
      new Set(Array.from(subjectToSkillIds.values()).flatMap((s) => Array.from(s.values())))
    );

    const masteryRows = allSkillIds.length
      ? await prisma.skillMastery.findMany({
          where: { studentId: student.id, skillId: { in: allSkillIds } },
          select: { skillId: true, mastery: true },
        })
      : [];

    // Map skillId -> mastery
    const masteryMap = new Map<string, number>();
    for (const m of masteryRows) masteryMap.set(m.skillId, m.mastery ?? 0);

    // Assemble rows
    const correctMap = new Map(bySubjectCorrect.map((r) => [r.subject, r._count._all]));
    const rows: Row[] = bySubjectTotals.map((tot) => {
      const subject = tot.subject ?? "—";
      const attempted = tot._count._all;

      const correct = correctMap.get(subject) ?? 0;
      const accuracy = attempted > 0 ? correct / attempted : 0;

      // mastery = average of mastery over skills seen in this subject (if none, 0)
      const skillSet = subjectToSkillIds.get(subject) ?? new Set<string>();
      const masteryVals: number[] = [];
      skillSet.forEach((sid) => {
        const v = masteryMap.get(sid);
        if (typeof v === "number") masteryVals.push(v);
      });
      const mastery =
        masteryVals.length > 0 ? masteryVals.reduce((s, x) => s + x, 0) / masteryVals.length : 0;

      return { subject, attempted, accuracy, mastery };
    });

    // Sort by attempted desc for a nice default order
    rows.sort((a, b) => b.attempted - a.attempted);

    return NextResponse.json({
      bySubject: rows,
      overview: {
        attempts: rows.reduce((s, r) => s + r.attempted, 0),
        accuracy:
          rows.reduce((s, r) => s + r.accuracy * r.attempted, 0) /
          Math.max(1, rows.reduce((s, r) => s + r.attempted, 0)),
        mastery:
          rows.length > 0
            ? rows.reduce((s, r) => s + r.mastery, 0) / rows.length
            : 0,
      },
    });
  } catch (e: any) {
    console.error("student-analytics(bySubject) error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
