// app/api/students/[id]/profile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SKILLS } from "@/lib/skills";
import { wilson } from "@/lib/stats";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const mastery = await prisma.skillMastery.findMany({ where: { studentId: id } });
  const attempts = await prisma.attempt.findMany({
    where: { studentId: id },
    orderBy: { createdAt: "desc" },
    take: 300, // recent history for trends
  });

  // per-skill recent window for Wilson intervals
  const recentBySkill = new Map<string, { c: number; n: number }>();
  for (const a of attempts) {
    for (const s of a.skillIds) {
      const t = recentBySkill.get(s) ?? { c: 0, n: 0 };
      t.n += 1; t.c += a.correct ? 1 : 0;
      recentBySkill.set(s, t);
    }
  }

  const rows = mastery.map(m => {
    const rec = recentBySkill.get(m.skillId) ?? { c: 0, n: 0 };
    const ci = wilson(rec.c, rec.n);
    return {
      skillId: m.skillId,
      skillName: SKILLS[m.skillId] ?? m.skillId,
      mastery: m.mastery,
      attempts: m.n,
      ciLow: ci.low, ciHigh: ci.high,
      lastSeenAt: m.lastSeenAt,
    }
  });

  // timeseries (rolling accuracy)
  const ts = buildRollingAccuracySeries(attempts); // {date, accuracy}[]

  return NextResponse.json({ skills: rows, trend: ts });
}
