// app/api/backfill-auth-userid/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type BackfillRow = { email: string; authUserId: string };

export async function POST(req: Request) {
  try {
    const { records } = (await req.json()) as { records?: BackfillRow[] };

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "Missing records" }, { status: 400 });
    }

    const results: Array<{
      email: string;
      authUserId: string;
      status: "updated" | "skipped" | "not_found" | "conflict";
      message?: string;
    }> = [];

    for (const row of records) {
      const email = row?.email?.trim().toLowerCase();
      const authUserId = row?.authUserId?.trim();
      if (!email || !authUserId) {
        results.push({
          email: row?.email ?? "",
          authUserId: row?.authUserId ?? "",
          status: "skipped",
          message: "Missing email or authUserId",
        });
        continue;
      }

      const student = await prisma.student.findUnique({
        where: { email },
        select: { id: true, authUserId: true },
      });

      if (!student) {
        results.push({ email, authUserId, status: "not_found" });
        continue;
      }

      if (student.authUserId && student.authUserId !== authUserId) {
        results.push({
          email,
          authUserId,
          status: "conflict",
          message: `Existing authUserId differs (${student.authUserId})`,
        });
        continue;
      }

      if (student.authUserId === authUserId) {
        results.push({ email, authUserId, status: "skipped", message: "Already linked" });
        continue;
      }

      await prisma.student.update({
        where: { email },
        data: { authUserId },
      });

      results.push({ email, authUserId, status: "updated" });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    console.error("backfill-auth-userid error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
