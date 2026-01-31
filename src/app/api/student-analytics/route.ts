// app/api/student-analytics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Row = { subject: string; attempted: number; accuracy: number; mastery: number };

export async function POST(req: Request) {
  try {
    const { email, name, authUserId } = (await req.json()) as {
      authUserId?: string;
      email?: string;
      name?: string;
    };
    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail) {
      console.log(`[student-analytics] Looking for student with email: ${normalizedEmail}`);
    } else {
      console.warn("[student-analytics] Missing email, falling back to authUserId lookup");
    }

    let student = normalizedEmail
      ? await prisma.student.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, authUserId: true },
        })
      : null;

    if (!student && authUserId) {
      student = await prisma.student.findUnique({
        where: { authUserId },
        select: { id: true, email: true, name: true, authUserId: true },
      });
    }

    if (!student && !normalizedEmail && !authUserId) {
      console.error("[student-analytics] Missing email and authUserId");
      return NextResponse.json({ error: "Missing email and authUserId" }, { status: 400 });
    }
    
    if (student) {
      // Ensure authUserId is linked to the correct Supabase UID
      if (authUserId && student.authUserId !== authUserId) {
        student = await prisma.student.update({
          where: { id: student.id },
          data: { authUserId },
          select: { id: true, email: true, name: true, authUserId: true },
        });
        console.log(`[student-analytics] Updated authUserId for student: ${student.id}`);
      }
    } else if (normalizedEmail) {
      console.warn(`[student-analytics] Student not found in Prisma for email: ${normalizedEmail}`);
      try {
        student = await prisma.student.create({
          data: {
            authUserId,
            email: normalizedEmail,
            name: name || normalizedEmail.split("@")[0],
          },
          select: { id: true, email: true, name: true, authUserId: true },
        });
        console.log(`[student-analytics] Created student via analytics fallback: ${student.id}`);
      } catch (createError: any) {
        if (createError.code === "P2002") {
          const existingByEmail = await prisma.student.findUnique({
            where: { email: normalizedEmail },
            select: { id: true, email: true, name: true, authUserId: true },
          });
          if (existingByEmail && authUserId && existingByEmail.authUserId !== authUserId) {
            student = await prisma.student.update({
              where: { id: existingByEmail.id },
              data: { authUserId },
              select: { id: true, email: true, name: true, authUserId: true },
            });
            console.log(`[student-analytics] Linked existing student after conflict: ${student.id}`);
          } else {
            student = existingByEmail ?? null;
          }
        }
      }
    }

    if (!student) {
      // Try to find by checking if there are any students at all with similar UUIDs (debugging)
      const allStudents = await prisma.student.findMany({
        select: { id: true, authUserId: true, email: true },
        take: 5,
      });
      console.log(`[student-analytics] Sample of students in database:`, allStudents.map((s: { id: string; authUserId: string | null; email: string }) => ({
        id: s.id,
        authUserId: s.authUserId,
        email: s.email
      })));

      // Return empty data structure instead of error to allow UI to display properly
      return NextResponse.json({
        bySubject: [],
        overview: {
          attempts: 0,
          accuracy: 0,
          mastery: 0,
        },
      });
    }

    console.log(`[student-analytics] Found student with id: ${student.id}`);

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
    const allQids = Array.from(
      new Set(subjQs.map((r: { questionId: string | null }) => r.questionId).filter(Boolean) as string[])
    );
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
    const correctMap = new Map(
      bySubjectCorrect.map((r: { subject: string | null; _count: { _all: number } }) => [r.subject, r._count._all])
    );
    const rows: Row[] = bySubjectTotals.map((tot: { subject: string | null; _count: { _all: number } }) => {
      const subject = tot.subject ?? "—";
      const attempted = tot._count._all;

      const correct = (correctMap.get(subject) as number | undefined) ?? 0;
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

    const overview = {
      attempts: rows.reduce((s, r) => s + r.attempted, 0),
      accuracy:
        rows.reduce((s, r) => s + r.accuracy * r.attempted, 0) /
        Math.max(1, rows.reduce((s, r) => s + r.attempted, 0)),
      mastery:
        rows.length > 0
          ? rows.reduce((s, r) => s + r.mastery, 0) / rows.length
          : 0,
    };

    console.log(`[student-analytics] Returning data: ${rows.length} subjects, ${overview.attempts} total attempts`);

    return NextResponse.json({
      bySubject: rows,
      overview,
    });
  } catch (e: any) {
    console.error("student-analytics(bySubject) error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
