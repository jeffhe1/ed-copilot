# Education Copilot

Education Copilot is a VCE-focused education platform for Victorian schools. This repository contains two experiences in one Next.js application:

- **Interactive pilot** — teacher assignment creation, AI question generation, student practice, saved progress, and answer explanations.
- **School website** — a public-facing overview of the product, vision, trust approach, team, and school pilot offer.

## Run locally

### Prerequisites

- Node.js 20 or later
- npm
- Git

### 1. Clone and install

```bash
git clone https://github.com/jeffhe1/ed-copilot.git
cd ed-copilot
npm ci
```

### 2. Configure environment variables

Create a `.env.local` file in the project root. Ask a project owner for the shared development values; never commit this file.

```env
# Supabase authentication and application data
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# PostgreSQL / Prisma
DATABASE_URL=
DIRECT_URL=

# Question generation — configure the provider used by the app
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
```

The school website can be viewed without these values. The pilot interface also opens without them, but authentication, database persistence, and live question generation require the relevant services to be configured.

After changing the Prisma schema, regenerate the client:

```bash
npx prisma generate
```

### 3. Start the development server

```bash
npm run dev
```

Open the following routes:

| Experience | Local URL |
| --- | --- |
| Teacher and student pilot | [http://localhost:3000](http://localhost:3000) |
| School-facing website | [http://localhost:3000/website](http://localhost:3000/website) |
| Direct pilot alias | [http://localhost:3000/demo](http://localhost:3000/demo) |

Use the **Teacher / Student** switch in the pilot to demonstrate the full workflow:

1. Open the Teacher workspace.
2. Create an assignment, choose the topic and number of questions, and generate it.
3. Switch to the Student workspace.
4. Open the new assignment and answer its questions.
5. Incorrect answers show the correct answer and worked reasoning.

Assignment data is retained in the current browser for the interactive demonstration. Configure the shared backend services before using the system across different devices or user accounts.

## Production build

Validate the application before opening a pull request:

```bash
npm run build
npx tsc --noEmit
```

To run the production build locally:

```bash
npm run build
npm start
```

## Project structure

```text
src/app/page.tsx                         Interactive pilot route
src/app/website/page.tsx                 School website route
src/app/demo/page.tsx                    Pilot alias route
src/components/mvp/                      Teacher and student pilot UI
src/components/marketing/                School website UI
src/app/api/generate-math/route.ts       AI question generation API
src/app/api/ensure-student/route.ts      Student account provisioning API
prisma/schema.prisma                     Application database schema
```

## Current pilot capabilities

- AI-assisted VCE-style multiple-choice question generation
- Teacher assignment creation with a chosen question count
- Student assignment access and practice flow
- Immediate marking and worked reasoning after an incorrect response
- Teacher/student dashboard demonstration
- Separate school-facing product website
- Mathematical notation and graph rendering

## Roadmap

- Stronger VCAA study-design alignment and content review workflows
- Shared multi-user assignment persistence across devices
- Teacher-controlled question approval and editing
- Exam and printable PDF generation
- Marking assistance for written responses
- Class analytics, misconceptions, and intervention reporting
- School administration, privacy, and deployment controls
- Hybrid retrieval and syllabus-aware question recommendations

## Security

Do not commit `.env`, `.env.local`, database credentials, Supabase keys, or AI-provider keys. Share development secrets using the team's approved password manager or secret-management service.
