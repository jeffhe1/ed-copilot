// app/api/ensure-student/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { authUserId?: string; email?: string; name?: string };
    const { authUserId, email, name } = body;
    if (!authUserId) {
      return NextResponse.json({ error: "Missing authUserId" }, { status: 400 });
    }

    console.log(`[ensure-student] Checking for student with authUserId: ${authUserId}`);

    // Check if student already exists in Prisma by authUserId
    let student = await prisma.student.findUnique({
      where: { authUserId },
      select: { id: true, name: true, email: true, authUserId: true },
    });

    // If not found and email provided, try linking by email before creating
    if (!student && email) {
      const byEmail = await prisma.student.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, authUserId: true },
      });
      if (byEmail) {
        if (!byEmail.authUserId) {
          student = await prisma.student.update({
            where: { email },
            data: { authUserId, name: name || byEmail.name },
            select: { id: true, name: true, email: true },
          });
          console.log(`[ensure-student] Linked existing student by email: ${student.id}`);
        } else {
          if (name && byEmail.name !== name) {
            student = await prisma.student.update({
              where: { email },
              data: { name },
              select: { id: true, name: true, email: true },
            });
            console.log(`[ensure-student] Updated student name by email: ${student.id}`);
          } else {
            student = { id: byEmail.id, name: byEmail.name, email: byEmail.email };
          }
          console.warn(
            `[ensure-student] Email match has different authUserId: ${byEmail.authUserId}`
          );
        }
      }
    }

    if (student) {
      if (name && student.name !== name) {
        student = await prisma.student.update({
          where: { authUserId },
          data: { name },
          select: { id: true, name: true, email: true },
        });
        console.log(`[ensure-student] Updated student name for authUserId: ${student.id}`);
      } else {
        console.log(`[ensure-student] Student already exists in Prisma: ${student.id}`);
      }
      return NextResponse.json({ student, created: false });
    }

    console.log(`[ensure-student] Student not found in Prisma, attempting to create...`);

    // If not found, use email and name from request body (already parsed above)
    let finalEmail = email || "";
    let finalName = name || "New Student";

    if (!finalEmail) {
      // Try fetching from Supabase Student table as fallback
      console.log(`[ensure-student] Email not provided, checking Supabase Student table...`);
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data: supabaseStudent, error: supabaseError } = await supabase
        .from("Student")
        .select("email, name")
        .eq("authUserId", authUserId)
        .maybeSingle();

      if (supabaseError) {
        console.error(`[ensure-student] Error querying Supabase:`, supabaseError);
      }

      if (supabaseStudent) {
        finalEmail = supabaseStudent.email || "";
        finalName = supabaseStudent.name || (finalEmail ? finalEmail.split("@")[0] : "New Student");
        console.log(`[ensure-student] Found student in Supabase: email=${finalEmail}, name=${finalName}`);
      } else {
        console.warn(`[ensure-student] Student not found in Supabase Student table either`);
        return NextResponse.json(
          { error: "Student not found in Supabase Student table and cannot be created without email" },
          { status: 404 }
        );
      }
    }

    if (!finalEmail) {
      return NextResponse.json({ error: "Could not determine user email" }, { status: 400 });
    }

    // Create student in Prisma
    try {
      console.log(`[ensure-student] Creating student in Prisma: email=${finalEmail}, name=${finalName}`);
      student = await prisma.student.create({
        data: {
          authUserId,
          email: finalEmail,
          name: finalName,
        },
        select: { id: true, name: true, email: true },
      });
      console.log(`[ensure-student] Successfully created student: ${student.id}`);
      return NextResponse.json({ student, created: true });
    } catch (createError: any) {
      console.error(`[ensure-student] Error creating student:`, createError);
      // If create fails (e.g., unique constraint on email), try to find by email instead
      if (createError.code === 'P2002') {
        console.log(`[ensure-student] Unique constraint violation, trying to find by email...`);
        student = await prisma.student.findUnique({
          where: { email: finalEmail },
          select: { id: true, name: true, email: true, authUserId: true },
        });
        if (student) {
          // Update authUserId if it's missing
          if (!student.authUserId) {
            console.log(`[ensure-student] Updating existing student with authUserId...`);
            student = await prisma.student.update({
              where: { email: finalEmail },
              data: { authUserId, name: name || student.name },
              select: { id: true, name: true, email: true },
            });
          } else if (name && student.name !== name) {
            student = await prisma.student.update({
              where: { email: finalEmail },
              data: { name },
              select: { id: true, name: true, email: true },
            });
          }
          console.log(`[ensure-student] Found existing student by email: ${student.id}`);
          return NextResponse.json({ student, created: false });
        }
      }
      
      // Try to find by authUserId one more time (race condition check)
      student = await prisma.student.findUnique({
        where: { authUserId },
        select: { id: true, name: true, email: true },
      });
      if (student) {
        console.log(`[ensure-student] Found student after error (race condition): ${student.id}`);
        return NextResponse.json({ student, created: false });
      }
      throw createError;
    }
  } catch (e: any) {
    console.error("[ensure-student] error:", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

