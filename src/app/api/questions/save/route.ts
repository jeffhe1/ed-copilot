import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const { items, classId } = await req.json() as {
    classId?: string,
    items: Array<{
      stem_md: string,
      area: string, subject: string, topic: string,
      skillIds?: string[], difficulty?: number
    }>
  };

  if (!Array.isArray(items) || !items.length) {
    return NextResponse.json({ ok: false, error: "No items provided" }, { status: 400 });
  }

  const created = [];
  for (const it of items) {
    const q = await prisma.question.create({
      data: {
        prompt: it.stem_md,
        area: it.area, subject: it.subject, topic: it.topic,
        difficulty: it.difficulty ?? null,
        klass: classId ? { connect: { id: classId } } : undefined,
        qSkills: it.skillIds?.length
          ? { create: it.skillIds.map(id => ({ skillId: id })) }
          : undefined,
      },
    });
    created.push(q.id);
  }
  return NextResponse.json({ ok: true, ids: created });
}
