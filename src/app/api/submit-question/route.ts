// app/api/submit-question/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // make sure you have a prisma client here
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Utility: safe strings
const clip = (s: unknown, n = 512) =>
  (typeof s === 'string' ? s : '').slice(0, n);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      prompt,         // user’s question text
      area, subject, topic,
      authUserId,     // supabase.auth.getUser().user.id (string UUID)
    } = body ?? {};

    if (!authUserId) {
      return NextResponse.json({ error: 'Missing authUserId' }, { status: 401 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    // 1) Find student by authUserId (created earlier by your StudentProfileCard)
    const student = await prisma.student.findUnique({
      where: { authUserId },
      select: { id: true, email: true, name: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'No Student row for this user. Open the profile card once to create it.' },
        { status: 404 }
      );
    }

    // 2) Generate an answer (replace with your own generator)
    // Keep it simple & deterministic for now
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful STEM tutor.' },
        {
          role: 'user',
          content: `Area: ${area}\nSubject: ${subject}\nTopic: ${topic}\nQuestion: ${prompt}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });

    const answerText =
      completion.choices?.[0]?.message?.content?.trim() || 'No answer generated.';

    // 3) Persist the Question first (so Attempt can reference it)
    const question = await prisma.question.create({
      data: {
        prompt: clip(prompt, 5000),
        area: clip(area, 128),
        subject: clip(subject, 128),
        topic: clip(topic, 128),
        // Optional: set difficulty or attach to a Class if you have one
      },
      select: { id: true },
    });

    // 4) Persist Attempt (we don’t know correctness yet; set later if you auto-mark)
    // Required fields in your schema: studentId, questionId, correct, skillIds, area, subject, topic
    const attempt = await prisma.attempt.create({
      data: {
        studentId: student.id,
        questionId: question.id,
        correct: false,                  // set true/false when you have marking
        skillIds: [],                    // fill from your tagging pipeline if available
        difficulty: null,
        timeTakenMs: null,
        area: clip(area, 128),
        subject: clip(subject, 128),
        topic: clip(topic, 128),
      },
      select: { id: true, createdAt: true },
    });

    // 5) Respond to client for rendering
    return NextResponse.json({
      ok: true,
      answer: answerText,
      questionId: question.id,
      attemptId: attempt.id,
    });
  } catch (err: any) {
    console.error('submit-question error:', err);
    return NextResponse.json({ error: err?.message ?? 'Server error' }, { status: 500 });
    }
}
