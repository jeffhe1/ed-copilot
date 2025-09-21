// lib/mastery.ts
import { prisma } from "@/lib/db";
export async function updateMastery({ studentId, correct, skillIds, difficulty }:{
  studentId: string; correct: boolean; skillIds: string[]; difficulty?: number;
}) {
  const now = new Date();
  const alphaBase = 0.12;
  const diffAdj = difficulty ? (1 + 0.1 * (difficulty - 3)) : 1;
  const alpha = Math.min(Math.max(alphaBase * diffAdj, 0.04), 0.3);

  await Promise.all(skillIds.map(async skillId => {
    const existing = await prisma.skillMastery.findUnique({ where: { studentId_skillId: { studentId, skillId } }});
    if (!existing) {
      return prisma.skillMastery.create({
        data: { studentId, skillId, mastery: correct ? 0.6 : 0.4, n: 1, lastSeenAt: now }
      });
    }
    const days = Math.max((now.getTime() - new Date(existing.lastSeenAt).getTime()) / (1000*3600*24), 0);
    const decay = Math.pow(1 - alpha, days); // simple time decay
    const decayed = decay * existing.mastery;
    const updated = decayed + alpha * (correct ? 1 : 0);
    return prisma.skillMastery.update({
      where: { id: existing.id },
      data: { mastery: clamp01(updated), n: existing.n + 1, lastSeenAt: now }
    });
  }));
}
const clamp01 = (x:number)=>Math.max(0,Math.min(1,x));
