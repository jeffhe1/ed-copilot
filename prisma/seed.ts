import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // skills
  await prisma.skill.createMany({
    data: [
      { id: "algebra.linear", name: "Linear Algebraic Manipulation" },
      { id: "equations.solve", name: "Solving Equations" },
      { id: "functions.graphs", name: "Functions & Graphs" },
      { id: "calculus.derivative.rules", name: "Derivative Rules" },
    ],
    skipDuplicates: true,
  });

  // teacher + class + student
  const teacher = await prisma.teacher.upsert({
    where: { email: "teacher@example.com" },
    update: {},
    create: { name: "Demo Teacher", email: "teacher@example.com" },
  });

  const klass = await prisma.class.upsert({
    where: { id: "demo-class" },
    update: {},
    create: { id: "demo-class", name: "Math Demo", teacherId: teacher.id },
  });

  const student = await prisma.student.upsert({
    where: { email: "student@example.com" },
    update: {},
    create: { name: "Demo Student", email: "student@example.com" },
  });

  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId: student.id, classId: klass.id } },
    update: {},
    create: { studentId: student.id, classId: klass.id },
  });

  console.log({ teacher: teacher.id, class: klass.id, student: student.id });
}
main().finally(() => prisma.$disconnect());
