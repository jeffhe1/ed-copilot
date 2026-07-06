"use client";

import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Flame,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  Loader2,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  TriangleAlert,
  UploadCloud,
  UserRound,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import styles from "./education-copilot-mvp.module.css";

type Role = "teacher" | "student";
type TeacherView = "overview" | "assignment" | "marking" | "classes";
type StudentView = "overview" | "practice" | "retry";

type IconType = typeof LayoutDashboard;

type GeneratedQuestion = {
  id: number;
  stem_md: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
  explanation_md: string;
  area?: string;
  subject?: string;
  topic?: string;
  difficulty?: number;
  graph?: unknown;
};

type PilotAssignment = {
  id: string;
  title: string;
  className: string;
  subject: string;
  topic: string;
  difficulty: string;
  dueDate: string;
  questions: GeneratedQuestion[];
  createdAt: string;
  status: "published";
};

type AssignmentDraft = Omit<PilotAssignment, "id" | "createdAt" | "status">;

type QuestionResult = { selected: string; correct: boolean };

type PilotProgress = {
  assignmentId: string;
  currentIndex: number;
  results: Record<string, QuestionResult>;
  completedAt?: string;
};

const ASSIGNMENTS_STORAGE_KEY = "education-copilot-pilot-assignments-v1";
const PROGRESS_STORAGE_KEY = "education-copilot-pilot-progress-v1";

const DEMO_GENERATED_QUESTIONS: GeneratedQuestion[] = [
  {
    id: 1,
    stem_md: "The graph of $y=\\log_2(x)$ is transformed to $y=\\log_2(x-3)+1$. Which description is correct?",
    options: { A: "3 units left and 1 unit up", B: "3 units right and 1 unit up", C: "1 unit right and 3 units up", D: "3 units right and 1 unit down" },
    answer: "B",
    explanation_md: "Replacing $x$ with $x-3$ shifts the graph 3 units right, while adding 1 shifts it 1 unit up.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Transformations and Combinations", difficulty: 2,
  },
  {
    id: 2,
    stem_md: "State the vertical asymptote of $f(x)=\\log_3(2x-4)-2$.",
    options: { A: "$x=-2$", B: "$x=2$", C: "$x=4$", D: "$y=-2$" },
    answer: "B",
    explanation_md: "The logarithm requires $2x-4>0$. Its boundary is $2x-4=0$, so the vertical asymptote is $x=2$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Graph Features and Asymptotes", difficulty: 2,
  },
  {
    id: 3,
    stem_md: "The point $(4,2)$ lies on $y=\\log_2(x)$. Which point lies on $y=\\log_2(x+1)-3$?",
    options: { A: "$(3,-1)$", B: "$(5,-1)$", C: "$(3,5)$", D: "$(5,5)$" },
    answer: "A",
    explanation_md: "The graph moves 1 unit left and 3 units down, taking $(4,2)$ to $(3,-1)$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Transformations and Combinations", difficulty: 3,
  },
  {
    id: 4,
    stem_md: "For $g(x)=-2\\log_5(x)+1$, which statement is true?",
    options: { A: "The range is $y>1$", B: "The domain is all real numbers", C: "The graph is reflected in the $x$-axis and dilated by factor 2", D: "The vertical asymptote is $x=1$" },
    answer: "C",
    explanation_md: "The factor $-2$ outside the logarithm reflects the graph in the $x$-axis and applies a vertical dilation by factor 2.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Transformations and Combinations", difficulty: 3,
  },
  {
    id: 5,
    stem_md: "Solve $\\log_2(x-1)+\\log_2(x+1)=3$ for $x$ in the valid domain.",
    options: { A: "$x=3$", B: "$x=-3$", C: "$x=\\sqrt{7}$", D: "$x=\\sqrt{9}$" },
    answer: "A",
    explanation_md: "$\\log_2((x-1)(x+1))=3$ gives $x^2-1=8$, so $x=\\pm3$. The domain requires $x>1$, hence $x=3$.",
    area: "Mathematical Methods", subject: "Algebra", topic: "Indices and Logarithms", difficulty: 4,
  },
  {
    id: 6,
    stem_md: "What is the domain of $h(x)=\\log_4(x-2)+5$?",
    options: { A: "$x>2$", B: "$x\\ge 2$", C: "$x<2$", D: "All real numbers" },
    answer: "A",
    explanation_md: "The logarithm input must be positive: $x-2>0$, so $x>2$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Inverses, Domains and Ranges", difficulty: 2,
  },
  {
    id: 7,
    stem_md: "Which function is the inverse of $f(x)=2^x+4$?",
    options: { A: "$f^{-1}(x)=\\log_2(x)+4$", B: "$f^{-1}(x)=\\log_2(x-4)$", C: "$f^{-1}(x)=2^{x-4}$", D: "$f^{-1}(x)=\\log_4(x-2)$" },
    answer: "B",
    explanation_md: "From $y=2^x+4$, rearrange to $y-4=2^x$, then $x=\\log_2(y-4)$. Swap variables to obtain $f^{-1}(x)=\\log_2(x-4)$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Inverses, Domains and Ranges", difficulty: 3,
  },
  {
    id: 8,
    stem_md: "Find the $x$-intercept of $y=\\log_3(x+2)-1$.",
    options: { A: "$x=-1$", B: "$x=1$", C: "$x=3$", D: "$x=5$" },
    answer: "B",
    explanation_md: "At the intercept, $0=\\log_3(x+2)-1$, so $\\log_3(x+2)=1$. Hence $x+2=3$ and $x=1$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Graph Features and Asymptotes", difficulty: 3,
  },
  {
    id: 9,
    stem_md: "Compared with $y=\\log_2(x)$, what is the effect of changing the base to $\\tfrac12$ in $y=\\log_{1/2}(x)$?",
    options: { A: "Reflection in the $x$-axis", B: "Reflection in the $y$-axis", C: "Translation 1 unit left", D: "Vertical dilation by factor 2" },
    answer: "A",
    explanation_md: "Since $\\log_{1/2}(x)=-\\log_2(x)$, all output values change sign, reflecting the graph in the $x$-axis.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Transformations and Combinations", difficulty: 4,
  },
  {
    id: 10,
    stem_md: "If $f(x)=\\log_2(x)$ and $g(x)=x-5$, which expression gives $(f\\circ g)(x)$?",
    options: { A: "$\\log_2(x)-5$", B: "$\\log_2(x+5)$", C: "$\\log_2(x-5)$", D: "$2^{x-5}$" },
    answer: "C",
    explanation_md: "Composition means substitute $g(x)$ into $f$: $(f\\circ g)(x)=f(g(x))=\\log_2(x-5)$.",
    area: "Mathematical Methods", subject: "Functions and Graphs", topic: "Transformations and Combinations", difficulty: 3,
  },
];

function MathText({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown>;
}

const masteryRows = [
  { topic: "Functions & graphs", scores: [1, 3, 8, 10, 6] },
  { topic: "Probability", scores: [0, 2, 6, 11, 9] },
  { topic: "Calculus", scores: [2, 4, 9, 9, 4] },
  { topic: "Transformations", scores: [1, 3, 7, 12, 5] },
  { topic: "Trigonometry", scores: [0, 2, 5, 10, 11] },
];

const studentRows = [
  { initials: "CN", name: "Chloe Nguyen", completion: "92%", accuracy: "86%", state: "On track" },
  { initials: "LS", name: "Lachlan Smith", completion: "85%", accuracy: "78%", state: "On track" },
  { initials: "AP", name: "Ava Patel", completion: "60%", accuracy: "62%", state: "Needs support" },
  { initials: "JL", name: "Jacob Lee", completion: "45%", accuracy: "55%", state: "Needs support" },
];

const retryQuestions = [
  {
    id: "Q1",
    text: "The graph of y = log(x) is transformed to y = log(x) − 3. Which option describes the transformation?",
    subject: "VCE Methods",
    tag: "Concept gap",
    level: "Easy",
  },
  {
    id: "Q2",
    text: "Solve for x: log₃(2x − 1) = 2",
    subject: "VCE Methods",
    tag: "Algebra slip",
    level: "Medium",
  },
  {
    id: "Q3",
    text: "A bag contains 5 red, 3 blue and 2 green balls. Find P(both red) without replacement.",
    subject: "VCE General",
    tag: "Concept gap",
    level: "Medium",
  },
];

function Logo() {
  return (
    <div className={styles.brand}>
      <span className={styles.logoMark} aria-hidden="true">
        <BookOpen size={21} strokeWidth={2.4} />
      </span>
      <span>Education Copilot</span>
    </div>
  );
}

function IconBadge({ icon: Icon, tone = "purple" }: { icon: IconType; tone?: string }) {
  return (
    <span className={`${styles.iconBadge} ${styles[`tone_${tone}`]}`}>
      <Icon size={19} strokeWidth={2.2} />
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  change,
  tone = "purple",
}: {
  icon: IconType;
  label: string;
  value: string;
  change: string;
  tone?: string;
}) {
  const Icon = icon;
  return (
    <article className={styles.statCard}>
      <IconBadge icon={Icon} tone={tone} />
      <div>
        <p>{label}</p>
        <strong className={styles[`text_${tone}`]}>{value}</strong>
        <span className={change.startsWith("+") ? styles.positive : styles.muted}>{change}</span>
      </div>
    </article>
  );
}

function SectionTitle({ icon, title, action }: { icon: IconType; title: string; action?: string }) {
  const Icon = icon;
  return (
    <div className={styles.sectionTitle}>
      <div>
        <span className={styles.miniIcon}><Icon size={17} /></span>
        <h2>{title}</h2>
      </div>
      {action ? <button className={styles.textButton}>{action} <ChevronRight size={15} /></button> : null}
    </div>
  );
}

function ProgressBar({ value, tone = "purple" }: { value: number; tone?: string }) {
  return (
    <span className={styles.progressTrack} aria-label={`${value}%`}>
      <span className={`${styles.progressFill} ${styles[`fill_${tone}`]}`} style={{ width: `${value}%` }} />
    </span>
  );
}

function TeacherOverview({ onNavigate }: { onNavigate: (view: TeacherView) => void }) {
  return (
    <>
      <div className={styles.statGrid}>
        <StatCard icon={Users} label="Total students" value="28" change="+3 this term" />
        <StatCard icon={CalendarDays} label="Assignments active" value="6" change="+1 this week" tone="blue" />
        <StatCard icon={Target} label="Average class accuracy" value="76%" change="+8% this term" tone="green" />
        <StatCard icon={TriangleAlert} label="Students needing support" value="7" change="Review suggested" tone="orange" />
      </div>

      <div className={styles.twoThirdGrid}>
        <section className={styles.card}>
          <SectionTitle icon={BarChart3} title="Class mastery overview" action="Full analysis" />
          <p className={styles.eyebrow}>VCE Mathematical Methods · Unit 3</p>
          <div className={styles.masteryTable}>
            <div className={styles.masteryHeader}>
              <span />
              <span>Not started</span><span>Beginning</span><span>Developing</span><span>Proficient</span><span>Mastered</span>
            </div>
            {masteryRows.map((row) => (
              <div className={styles.masteryRow} key={row.topic}>
                <strong>{row.topic}</strong>
                {row.scores.map((score, index) => (
                  <span className={`${styles.masteryCell} ${styles[`mastery_${index}`]}`} key={`${row.topic}-${index}`}>{score}</span>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.legend}>
            {["Not started", "Beginning", "Developing", "Proficient", "Mastered"].map((item, index) => (
              <span key={item}><i className={styles[`legend_${index}`]} />{item}</span>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <SectionTitle icon={BrainCircuit} title="AI-detected misconceptions" />
          <div className={styles.insightList}>
            {[
              ["Shifting log graphs vertically", "42%"],
              ["P(A or B) versus P(A) + P(B)", "38%"],
              ["Chain rule in differentiation", "33%"],
              ["Degrees to radians conversion", "25%"],
            ].map(([label, value], index) => (
              <button className={styles.insightRow} key={label}>
                <span className={styles.ranked}>{index + 1}</span>
                <span>{label}</span>
                <strong>{value}</strong>
              </button>
            ))}
          </div>
          <div className={styles.aiCallout}>
            <Sparkles size={18} />
            <span><strong>Suggested next step</strong>Assign a 10-minute transformation refresher.</span>
            <button onClick={() => onNavigate("assignment")}>Create <ArrowRight size={14} /></button>
          </div>
        </section>
      </div>

      <div className={styles.bottomGrid}>
        <section className={styles.card}>
          <SectionTitle icon={TrendingUp} title="Class engagement" />
          <p className={styles.eyebrow}>Average quiz completion · Last 7 days</p>
          <div className={styles.lineChart}>
            <div className={styles.chartGrid}><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div>
            <svg viewBox="0 0 500 175" role="img" aria-label="Class engagement trending upwards over seven days">
              <defs>
                <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#6c5ce7" stopOpacity=".24" />
                  <stop offset="1" stopColor="#6c5ce7" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className={styles.chartArea} d="M15 128 C65 110 78 75 125 80 S185 75 220 65 S285 30 330 45 S400 45 485 92 L485 160 L15 160 Z" />
              <path className={styles.chartLine} d="M15 128 C65 110 78 75 125 80 S185 75 220 65 S285 30 330 45 S400 45 485 92" />
              {["15,128", "95,82", "175,76", "255,55", "335,45", "415,50", "485,92"].map((point) => {
                const [cx, cy] = point.split(",");
                return <circle key={point} cx={cx} cy={cy} r="5" />;
              })}
            </svg>
            <div className={styles.chartLabels}><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
          </div>
        </section>

        <section className={styles.card}>
          <SectionTitle icon={Users} title="Student performance" action="View class" />
          <div className={styles.studentTable}>
            <div className={styles.studentTableHead}><span>Student</span><span>Completion</span><span>Accuracy</span><span>Status</span></div>
            {studentRows.map((student) => (
              <div className={styles.studentTableRow} key={student.name}>
                <span className={styles.studentName}><i>{student.initials}</i>{student.name}</span>
                <span>{student.completion}</span>
                <span>{student.accuracy}</span>
                <span className={student.state === "On track" ? styles.goodPill : styles.warnPill}>{student.state}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <SectionTitle icon={TriangleAlert} title="Needs attention" />
          <div className={styles.attentionList}>
            {studentRows.slice(2).map((student, index) => (
              <div key={student.name}>
                <span className={styles.largeAvatar}>{student.initials}</span>
                <span><strong>{student.name}</strong><small>{student.accuracy} accuracy · {index + 2} tasks late</small></span>
                <b>High</b>
              </div>
            ))}
          </div>
          <button className={styles.outlineButton}><Send size={16} /> Send support message</button>
        </section>
      </div>
    </>
  );
}

function AssignmentBuilder({ notify, onPublish }: { notify: (message: string) => void; onPublish: (assignment: AssignmentDraft) => string }) {
  const [questions, setQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState("Standard");
  const [topic, setTopic] = useState("Sketching and applying transformations of logarithmic functions");
  const [generationStatus, setGenerationStatus] = useState<"idle" | "loading" | "success" | "fallback">("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [publishedAssignmentId, setPublishedAssignmentId] = useState<string | null>(null);
  const [modes, setModes] = useState({ attempt: true, hints: true, answers: false, timed: false });

  const toggleMode = (key: keyof typeof modes) => setModes((current) => ({ ...current, [key]: !current[key] }));
  const activeQuestion = generatedQuestions[activeQuestionIndex];

  const generateAssignment = async () => {
    setGenerationStatus("loading");
    setGenerationError(null);
    setEditingQuestion(false);
    setPublishedAssignmentId(null);

    try {
      const response = await fetch("/api/generate-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Create a ${difficulty.toLowerCase()} VCE Mathematical Methods assignment for Year 11 students. Focus on: ${topic}. Use authentic VCE-style wording, plausible distractors and concise worked explanations.`,
          count: questions,
          area: "Mathematical Methods",
          subject: "Functions and Graphs",
          topic: "Transformations and Combinations",
          model: "o4-mini",
        }),
      });

      const data = await response.json() as { items?: GeneratedQuestion[]; error?: string };
      if (!response.ok || data.error || !Array.isArray(data.items) || data.items.length === 0) {
        throw new Error(data.error || "The question generator returned no questions.");
      }

      setGeneratedQuestions(data.items.map((item, index) => ({ ...item, id: item.id ?? index + 1 })));
      setActiveQuestionIndex(0);
      setGenerationStatus("success");
      notify(`${data.items.length} live AI questions generated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The live generator is unavailable.";
      const safeMessage = /api[_ -]?key|not configured|upstream|fetch/i.test(message)
        ? "Live AI credentials are not configured in this environment."
        : message;
      const samples = DEMO_GENERATED_QUESTIONS.slice(0, Math.min(questions, DEMO_GENERATED_QUESTIONS.length));
      setGeneratedQuestions(samples);
      setActiveQuestionIndex(0);
      setGenerationError(safeMessage);
      setGenerationStatus("fallback");
      notify("Live AI unavailable — reviewed demo questions loaded");
    }
  };

  const publishAssignment = () => {
    if (generatedQuestions.length === 0) return;
    const id = onPublish({
      title: topic,
      className: "11 Methods (2026)",
      subject: "VCE Mathematical Methods",
      topic,
      difficulty,
      dueDate: "Fri, 24 July 2026",
      questions: generatedQuestions,
    });
    setPublishedAssignmentId(id);
    notify("Assignment published to the student dashboard");
  };

  return (
    <div className={styles.builderGrid}>
      <section className={styles.card}>
        <div className={styles.stepTitle}><span>1</span><div><h2>Set the basics</h2><p>Build a VCE-aligned assignment in a few steps.</p></div></div>
        <div className={styles.formGrid}>
          <label>Class<button className={styles.selectButton}>11 Methods (2026) <ChevronDown size={16} /></button></label>
          <label>Subject<button className={styles.selectButton}>VCE Methods <ChevronDown size={16} /></button></label>
          <label>Difficulty
            <select className={styles.selectNative} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option>Foundation</option><option>Standard</option><option>Challenge</option>
            </select>
          </label>
        </div>
        <label className={styles.promptLabel}>Topic or learning intention
          <span className={styles.promptInput}><Sparkles size={18} /><input value={topic} onChange={(event) => setTopic(event.target.value)} /></span>
        </label>
        <div className={styles.topicSuggestions}>
          <span>Try a topic:</span>
          <button onClick={() => setTopic("Solving logarithmic equations using algebraic techniques")}>Logarithms</button>
          <button onClick={() => setTopic("Sketching and applying transformations of logarithmic functions")}>Graph transformations</button>
          <button onClick={() => setTopic("Applications of exponential and logarithmic models")}>Applications</button>
        </div>
        <div className={styles.rangeRow}>
          <label>Number of questions <strong>{questions}</strong>
            <input type="range" min="3" max="10" step="1" value={questions} onChange={(event) => setQuestions(Number(event.target.value))} />
            <span><i>3</i><i>5</i><i>8</i><i>10</i></span>
          </label>
          <label>Due date<button className={styles.selectButton}><CalendarDays size={17} /> Fri, 24 July 2026 <ChevronDown size={16} /></button></label>
        </div>
        <div className={styles.divider} />
        <div className={styles.stepTitle}><span>2</span><div><h2>Assignment mode</h2><p>Choose how students receive support.</p></div></div>
        <div className={styles.modeGrid}>
          {[
            ["attempt", FileCheck2, "Attempt before answer", "Students answer before seeing solutions."],
            ["hints", Lightbulb, "Hints available", "Offer progressive hints, never the final answer."],
            ["answers", ShieldCheck, "Hide final answers", "Keep complete solutions hidden until submitted."],
            ["timed", Clock3, "Timed practice", "Add a recommended time per question."],
          ].map(([key, Icon, title, body]) => {
            const modeKey = key as keyof typeof modes;
            return (
              <button className={`${styles.modeCard} ${modes[modeKey] ? styles.modeActive : ""}`} onClick={() => toggleMode(modeKey)} key={key as string}>
                <span><IconBadge icon={Icon as IconType} /><i className={styles.toggle}><b /></i></span>
                <strong>{title as string}</strong><small>{body as string}</small>
              </button>
            );
          })}
        </div>
        {generationStatus === "loading" ? (
          <div className={styles.generatingPanel}><Loader2 size={21} /><span><strong>Generating VCE-style questions…</strong>The AI is drafting questions, distractors and worked explanations.</span></div>
        ) : null}
        {activeQuestion ? (
          <section className={styles.generatedReview}>
            <div className={styles.generatedReviewHeader}>
              <div><span><Sparkles size={17} /></span><div><h3>Review generated questions</h3><p>Check, edit and approve before assigning to students.</p></div></div>
              <span className={generationStatus === "success" ? styles.liveBadge : styles.demoBadge}>{generationStatus === "success" ? "Live AI" : "Demo fallback"}</span>
            </div>
            {generationStatus === "fallback" ? <div className={styles.fallbackNotice}><TriangleAlert size={15} /><span>Showing reviewed sample questions because the live generator could not connect.<small>{generationError}</small></span></div> : null}
            <div className={styles.questionTabs}>
              {generatedQuestions.map((question, index) => <button className={activeQuestionIndex === index ? styles.questionTabActive : ""} onClick={() => { setActiveQuestionIndex(index); setEditingQuestion(false); }} key={`${question.id}-${index}`}>Q{index + 1}</button>)}
            </div>
            <article className={styles.generatedQuestionCard}>
              <div className={styles.generatedMeta}><span>{activeQuestion.subject ?? "VCE Mathematical Methods"}</span><span>Difficulty {activeQuestion.difficulty ?? 3}/5</span>{activeQuestion.graph ? <span>Graph included</span> : null}</div>
              {editingQuestion ? (
                <textarea className={styles.questionEditor} value={activeQuestion.stem_md} onChange={(event) => setGeneratedQuestions((current) => current.map((question, index) => index === activeQuestionIndex ? { ...question, stem_md: event.target.value } : question))} />
              ) : <div className={styles.generatedStem}><MathText>{activeQuestion.stem_md}</MathText></div>}
              <div className={styles.generatedOptions}>
                {Object.entries(activeQuestion.options).map(([letter, option]) => <div className={activeQuestion.answer === letter ? styles.correctOption : ""} key={letter}><span>{letter}</span><MathText>{option}</MathText>{activeQuestion.answer === letter ? <CheckCircle2 size={16} /> : null}</div>)}
              </div>
              <div className={styles.generatedExplanation}><Lightbulb size={17} /><span><strong>Worked explanation</strong><MathText>{activeQuestion.explanation_md}</MathText></span></div>
              <div className={styles.generatedQuestionActions}><button className={styles.secondaryButton} onClick={() => setEditingQuestion((current) => !current)}>{editingQuestion ? <Check size={16} /> : <Pencil size={16} />}{editingQuestion ? "Save edit" : "Edit question"}</button><button className={styles.secondaryButton} onClick={generateAssignment}><RotateCcw size={16} /> Regenerate set</button></div>
            </article>
          </section>
        ) : null}
        {generationStatus === "success" || generationStatus === "fallback" ? (
          <div className={styles.generatedBanner}><CheckCircle2 size={21} /><span><strong>{publishedAssignmentId ? "Published to students" : "Assignment draft ready"}</strong>{publishedAssignmentId ? `${generatedQuestions.length} questions are now visible in the student dashboard.` : `${generatedQuestions.length} questions are ready for teacher review.`}</span><button className={publishedAssignmentId ? styles.publishedButton : styles.publishButton} disabled={Boolean(publishedAssignmentId)} onClick={publishAssignment}>{publishedAssignmentId ? <><Check size={15} /> Published</> : <><Send size={15} /> Publish to students</>}</button></div>
        ) : null}
        <div className={styles.actionRow}>
          <button className={styles.primaryButton} disabled={generationStatus === "loading" || topic.trim().length < 5} onClick={generateAssignment}>{generationStatus === "loading" ? <Loader2 className={styles.spinner} size={18} /> : <WandSparkles size={18} />} {generationStatus === "loading" ? "Generating…" : "Generate assignment"}</button>
          <button className={styles.secondaryButton} onClick={() => notify("Draft saved")}>Save draft</button>
        </div>
      </section>

      <aside className={styles.stickyColumn}>
        <section className={styles.card}>
          <SectionTitle icon={FileText} title="Assignment preview" />
          <div className={styles.previewList}>
            <span><Users size={17} /><i>Class<strong>11 Methods (2026)</strong></i></span>
            <span><BookOpen size={17} /><i>Subject<strong>VCE Mathematical Methods</strong></i></span>
            <span><Sparkles size={17} /><i>Topic<strong>Logarithmic transformations</strong></i></span>
            <span><BarChart3 size={17} /><i>Difficulty<strong>{difficulty}</strong></i></span>
            <span><ListChecks size={17} /><i>Questions<strong>{generatedQuestions.length || questions} questions</strong></i></span>
            <span><Clock3 size={17} /><i>Estimated time<strong>{(generatedQuestions.length || questions) * 3}–{(generatedQuestions.length || questions) * 4} minutes</strong></i></span>
          </div>
        </section>
        <section className={`${styles.card} ${styles.shareCard}`}>
          <h2>Share with your class</h2><p>Students can join using this class code.</p>
          <button className={styles.codeButton}>EC–4A9F2B <span><Link2 size={16} /></span></button>
          <button className={styles.softButton} onClick={() => notify("Class link copied")}>Copy share link</button>
        </section>
      </aside>
    </div>
  );
}

function MarkingAssistant({ notify }: { notify: (message: string) => void }) {
  const [selected, setSelected] = useState(0);
  const [approved, setApproved] = useState(false);
  const submissions = [
    { name: "Ava Patel", task: "Methods SAC practice", score: "12 / 20", flag: "Review", time: "8 min ago" },
    { name: "Lachlan Smith", task: "Methods SAC practice", score: "17 / 20", flag: "Ready", time: "14 min ago" },
    { name: "Chloe Nguyen", task: "Methods SAC practice", score: "18 / 20", flag: "Ready", time: "22 min ago" },
  ];
  const submission = submissions[selected];

  useEffect(() => setApproved(false), [selected]);

  return (
    <div className={styles.markingGrid}>
      <section className={styles.card}>
        <SectionTitle icon={ClipboardCheck} title="Marking queue" action="View all 23" />
        <div className={styles.uploadZone}>
          <UploadCloud size={22} /><span><strong>Upload student work</strong>PDF, image or exported LMS submissions</span><button onClick={() => notify("Upload demo opened")}>Choose files</button>
        </div>
        <div className={styles.submissionList}>
          {submissions.map((item, index) => (
            <button className={selected === index ? styles.submissionActive : ""} onClick={() => setSelected(index)} key={item.name}>
              <span className={styles.largeAvatar}>{item.name.split(" ").map((part) => part[0]).join("")}</span>
              <span><strong>{item.name}</strong><small>{item.task} · {item.time}</small></span>
              <i className={item.flag === "Review" ? styles.warnPill : styles.goodPill}>{item.flag}</i>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <div className={styles.markingPrinciple}><ShieldCheck size={18} /><span><strong>Teacher-controlled marking</strong>AI drafts a mark and feedback. Nothing is released until you approve it.</span></div>
      </section>

      <section className={`${styles.card} ${styles.reviewPanel}`}>
        <div className={styles.reviewHeader}>
          <div><span className={styles.largeAvatar}>{submission.name.split(" ").map((part) => part[0]).join("")}</span><span><h2>{submission.name}</h2><p>Question 4 · Extended response · 5 marks</p></span></div>
          <button className={styles.secondaryButton}><Download size={16} /> Original</button>
        </div>
        <div className={styles.answerSheet}>
          <span className={styles.paperLabel}>Student response</span>
          <p><strong>f(x) = log₂(x − 1) + 3</strong></p>
          <p>The graph moves one unit to the right because x becomes x − 1. It then moves three units up. The vertical asymptote is x = 1 and the range stays all real numbers.</p>
          <div className={styles.handGraph} aria-label="Student sketch of a logarithmic graph">
            <span className={styles.yAxis} /><span className={styles.xAxis} /><span className={styles.asymptote} />
            <svg viewBox="0 0 300 140"><path d="M128 128 C132 95 142 78 162 65 C190 46 225 32 286 20" /></svg>
            <small>x = 1</small>
          </div>
        </div>
        <div className={styles.aiAssessment}>
          <div className={styles.aiAssessmentHead}><span><Sparkles size={18} />AI marking suggestion</span><strong>4 / 5</strong></div>
          <div className={styles.rubricRows}>
            <span><CheckCircle2 size={17} /><i><strong>Horizontal translation</strong>Correctly identifies 1 unit right.</i><b>1 / 1</b></span>
            <span><CheckCircle2 size={17} /><i><strong>Vertical translation</strong>Correctly identifies 3 units up.</i><b>1 / 1</b></span>
            <span><CheckCircle2 size={17} /><i><strong>Asymptote and range</strong>Both are stated correctly.</i><b>2 / 2</b></span>
            <span className={styles.partialRow}><Circle size={17} /><i><strong>Graph features</strong>Sketch omits the transformed x-intercept.</i><b>0 / 1</b></span>
          </div>
          <label className={styles.feedbackField}><MessageSquareText size={17} /><span>Draft feedback<textarea defaultValue="Strong understanding of both transformations and the asymptote. To earn full marks, label the x-intercept on your sketch and show how you found it." /></span></label>
        </div>
        <div className={styles.reviewActions}>
          <button className={styles.secondaryButton} onClick={() => notify("Mark adjusted")}>Adjust mark</button>
          <button className={approved ? styles.approvedButton : styles.primaryButton} onClick={() => { setApproved(true); notify("Mark approved — not yet released"); }}>
            {approved ? <><Check size={18} /> Approved</> : <><ShieldCheck size={18} /> Approve mark & feedback</>}
          </button>
        </div>
      </section>
    </div>
  );
}

function ClassesView({ onNavigate, notify }: { onNavigate: (view: TeacherView) => void; notify: (message: string) => void }) {
  const classes = [
    ["VCE Methods 12A", "28 students", "78% average", "3 active"],
    ["VCE General 11B", "24 students", "71% average", "2 active"],
    ["VCE Specialist 12C", "19 students", "82% average", "1 active"],
  ];
  return (
    <div className={styles.classesGrid}>
      <section className={styles.card}>
        <SectionTitle icon={GraduationCap} title="Your classes" />
        <div className={styles.classList}>
          {classes.map((item, index) => (
            <button className={index === 0 ? styles.classActive : ""} key={item[0]}>
              <IconBadge icon={BarChart3} tone={index === 2 ? "green" : index === 1 ? "blue" : "purple"} />
              <span><strong>{item[0]}</strong><small>{item[1]} · {item[2]} · {item[3]}</small></span><ChevronRight size={17} />
            </button>
          ))}
        </div>
        <button className={styles.outlineButton} onClick={() => notify("New class form opened")}><Plus size={17} /> Add class</button>
      </section>
      <section className={styles.card}>
        <div className={styles.classHero}>
          <IconBadge icon={BarChart3} /><div><h2>VCE Methods 12A</h2><p>Unit 3 & 4 · 2026</p></div>
          <button className={styles.primaryButton} onClick={() => onNavigate("assignment")}><Plus size={17} /> Create assignment</button>
        </div>
        <div className={styles.classMeta}>
          <span>Class code<strong>METHODS12A</strong></span><span>Teacher<strong>Jeff He</strong></span><span>Next task<strong>Methods Quiz 4 · due Friday</strong></span>
        </div>
        <div className={styles.studentTable}>
          <div className={styles.studentTableHead}><span>Student</span><span>Last active</span><span>Accuracy</span><span>Status</span></div>
          {studentRows.map((student, index) => (
            <div className={styles.studentTableRow} key={student.name}>
              <span className={styles.studentName}><i>{student.initials}</i>{student.name}</span><span>{index < 2 ? "Today" : `${index} days ago`}</span><span>{student.accuracy}</span><span className={styles.goodPill}>Active</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StudentOverview({
  onNavigate,
  assignments,
  progress,
  onStartAssignment,
}: {
  onNavigate: (view: StudentView) => void;
  assignments: PilotAssignment[];
  progress: Record<string, PilotProgress>;
  onStartAssignment: (assignmentId: string) => void;
}) {
  const week = [6, 11, 9, 15, 11, 10, 5];
  const latestAssignment = assignments[0];
  return (
    <>
      <div className={styles.statGrid}>
        <StatCard icon={Flame} label="Weekly study streak" value="7 days" change="Keep it up!" tone="orange" />
        <StatCard icon={ListChecks} label="Questions completed" value="124" change="+18 this week" />
        <StatCard icon={Target} label="Accuracy" value="82%" change="+6% this month" tone="green" />
        <StatCard icon={CalendarDays} label="Published assignments" value={String(assignments.length)} change={latestAssignment ? `New: ${latestAssignment.questions.length} questions` : "Nothing due yet"} tone="blue" />
      </div>
      <section className={`${styles.card} ${styles.assignmentInbox}`}>
        <SectionTitle icon={ClipboardCheck} title="Assignments from your teacher" />
        {assignments.length === 0 ? (
          <div className={styles.emptyAssignments}><BookOpen size={23} /><span><strong>No published assignments yet</strong>When your teacher publishes an assignment, it will appear here automatically.</span></div>
        ) : (
          <div className={styles.assignmentCards}>
            {assignments.map((assignment, index) => {
              const saved = progress[assignment.id];
              const completed = Boolean(saved?.completedAt);
              const answered = Object.keys(saved?.results ?? {}).length;
              const percent = Math.round((answered / assignment.questions.length) * 100);
              return (
                <article key={assignment.id}>
                  <span className={styles.assignmentIcon}><FileText size={20} /></span>
                  <div className={styles.assignmentCardBody}>
                    <span className={styles.assignmentMeta}>{index === 0 && !completed ? "New assignment" : completed ? "Completed" : "In progress"} · {assignment.className}</span>
                    <h3>{assignment.title}</h3>
                    <p>{assignment.questions.length} VCE-style questions · Due {assignment.dueDate}</p>
                    {answered > 0 && !completed ? <div className={styles.assignmentProgress}><ProgressBar value={percent} /><small>{answered} of {assignment.questions.length} answered</small></div> : null}
                  </div>
                  <span className={completed ? styles.completedPill : styles.newPill}>{completed ? "Completed" : index === 0 ? "New" : "Assigned"}</span>
                  <button className={styles.primaryButton} onClick={() => onStartAssignment(assignment.id)}>{completed ? "Review" : answered ? "Continue" : "Start assignment"} <ArrowRight size={16} /></button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <div className={styles.studentDashboardGrid}>
        <section className={`${styles.card} ${styles.continueCard}`}>
          <SectionTitle icon={BookOpen} title="Continue studying" />
          <div className={styles.focusBox}>
            <span>Current focus</span><h2>VCE Methods — transformations of logarithmic functions</h2>
            <div><small>Progress <strong>68%</strong></small><ProgressBar value={68} /></div>
            <button className={styles.primaryButton} onClick={() => latestAssignment ? onStartAssignment(latestAssignment.id) : onNavigate("practice")}>Resume practice <ArrowRight size={17} /></button>
          </div>
        </section>
        <section className={styles.card}>
          <SectionTitle icon={Sparkles} title="Recommended for you" />
          <div className={styles.recommendList}>
            {[
              ["VCE Methods", "Sketching transformations", "purple"],
              ["VCE Specialist", "Complex numbers in polar form", "blue"],
              ["VCE General", "Time series analysis", "green"],
              ["Revision", "Your 18 incorrect answers", "orange"],
            ].map(([subject, topic, tone]) => (
              <button key={topic} onClick={() => topic.includes("incorrect") ? onNavigate("retry") : onNavigate("practice")}><IconBadge icon={topic.includes("incorrect") ? RotateCcw : Sparkles} tone={tone} /><span><strong>{subject}</strong>{topic}</span><ChevronRight size={17} /></button>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <SectionTitle icon={ClipboardCheck} title="Recent results" action="View all" />
          <div className={styles.resultList}>
            {[["Methods Quiz 3", "4 / 5", "Today"], ["Specialist revision", "8 / 10", "Yesterday"], ["General maths", "7 / 10", "2 days ago"]].map((item) => (
              <div key={item[0]}><span><strong>{item[0]}</strong><small>VCE Mathematics</small></span><b>{item[1]}</b><i>{item[2]}</i></div>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <SectionTitle icon={BarChart3} title="Progress this week" />
          <div className={styles.weekBars}>{week.map((value, index) => <span key={index}><i style={{ height: `${value * 6}px` }} /><small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small></span>)}</div>
          <div className={styles.weekSummary}><strong>67 questions</strong><span>+12 vs last week</span></div>
        </section>
        <section className={styles.card}>
          <SectionTitle icon={Target} title="Weekly goal" />
          <h3>Complete 60 questions</h3><ProgressBar value={80} /><div className={styles.goalLabels}><span>80% of weekly goal</span><strong>48 / 60</strong></div>
          <button className={styles.softButton}>Edit goal</button>
        </section>
      </div>
    </>
  );
}

function LegacyPracticeView({ notify }: { notify: (message: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const answers = [
    ["A", "3 units to the right"], ["B", "3 units to the left"], ["C", "3 units upwards"], ["D", "3 units downwards"],
  ];
  return (
    <div className={styles.practiceLayout}>
      <section className={styles.card}>
        <div className={styles.practiceTop}><span>Question 4 of 10</span><span><Clock3 size={15} /> 08:42</span></div>
        <ProgressBar value={40} />
        <div className={styles.questionBody}>
          <span className={styles.subjectTag}>VCE Mathematical Methods · Functions</span>
          <h2>The graph of <em>y = log₂(x)</em> is transformed to <em>y = log₂(x) − 3</em>.</h2>
          <p>Which statement correctly describes the transformation?</p>
          <div className={styles.answerOptions}>
            {answers.map(([letter, answer]) => (
              <button className={`${selected === letter ? styles.answerSelected : ""} ${checked && letter === "D" ? styles.answerCorrect : ""} ${checked && selected === letter && letter !== "D" ? styles.answerWrong : ""}`} onClick={() => !checked && setSelected(letter)} key={letter}>
                <span>{letter}</span>{answer}{checked && letter === "D" ? <CheckCircle2 size={18} /> : null}
              </button>
            ))}
          </div>
          {checked ? <div className={styles.explanation}><Lightbulb size={20} /><span><strong>{selected === "D" ? "Correct — nice work." : "Almost. Look at the value outside the logarithm."}</strong>Subtracting 3 from the function output shifts every point vertically down by 3 units.</span></div> : null}
          <div className={styles.practiceActions}><button className={styles.secondaryButton} onClick={() => notify("Hint: consider whether −3 changes x or y")}>Get a hint</button><button className={styles.primaryButton} disabled={!selected} onClick={() => setChecked(true)}>{checked ? "Next question" : "Check answer"} <ArrowRight size={17} /></button></div>
        </div>
      </section>
      <aside className={styles.card}>
        <SectionTitle icon={Target} title="Session progress" />
        <div className={styles.sessionScore}><span>3</span><small>correct</small><i /><span>1</span><small>to review</small></div>
        <div className={styles.navigator}>{Array.from({ length: 10 }, (_, index) => <button className={index < 3 ? styles.doneQuestion : index === 3 ? styles.currentQuestion : ""} key={index}>{index + 1}</button>)}</div>
        <div className={styles.aiCallout}><BrainCircuit size={18} /><span><strong>Adaptive practice</strong>Questions adjust to your confidence and recent mistakes.</span></div>
      </aside>
    </div>
  );
}

function PracticeView({
  notify,
  assignment,
  progress,
  onProgress,
  onBack,
}: {
  notify: (message: string) => void;
  assignment: PilotAssignment | null;
  progress?: PilotProgress;
  onProgress: (progress: PilotProgress) => void;
  onBack: () => void;
}) {
  const practiceAssignment = useMemo<PilotAssignment>(() => assignment ?? {
    id: "demo-practice",
    title: "VCE Methods adaptive practice",
    className: "Independent practice",
    subject: "VCE Mathematical Methods",
    topic: "Functions and graphs",
    difficulty: "Standard",
    dueDate: "No due date",
    questions: DEMO_GENERATED_QUESTIONS,
    createdAt: "demo",
    status: "published",
  }, [assignment]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<Record<string, QuestionResult>>({});
  const question = practiceAssignment.questions[questionIndex];
  const correctCount = Object.values(results).filter((result) => result.correct).length;
  const reviewCount = Object.values(results).filter((result) => !result.correct).length;

  useEffect(() => {
    const restoredResults = progress?.results ?? {};
    const restoredIndex = Math.min(progress?.currentIndex ?? 0, practiceAssignment.questions.length - 1);
    const restored = restoredResults[String(restoredIndex)];
    setResults(restoredResults);
    setQuestionIndex(restoredIndex);
    setSelected(restored?.selected ?? null);
    setChecked(Boolean(restored));
    setFinished(Boolean(progress?.completedAt));
  }, [practiceAssignment.id, progress]);

  const saveProgress = (nextResults: Record<string, QuestionResult>, nextIndex: number, completedAt?: string) => {
    if (assignment) onProgress({
      assignmentId: assignment.id,
      currentIndex: nextIndex,
      results: nextResults,
      completedAt: completedAt ?? progress?.completedAt,
    });
  };

  const goToQuestion = (index: number) => {
    const existing = results[String(index)];
    setQuestionIndex(index);
    setSelected(existing?.selected ?? null);
    setChecked(Boolean(existing));
    setFinished(false);
    saveProgress(results, index);
  };

  const checkAnswer = () => {
    if (!selected) return;
    const nextResults = { ...results, [String(questionIndex)]: { selected, correct: selected === question.answer } };
    setResults(nextResults);
    setChecked(true);
    saveProgress(nextResults, questionIndex);
  };

  const nextQuestion = () => {
    if (questionIndex === practiceAssignment.questions.length - 1) {
      const completedAt = new Date().toISOString();
      setFinished(true);
      saveProgress(results, questionIndex, completedAt);
      notify("Assignment completed and saved");
      return;
    }
    goToQuestion(questionIndex + 1);
  };

  if (finished) {
    const incorrectIndexes = Object.entries(results).filter(([, result]) => !result.correct).map(([index]) => Number(index));
    return (
      <section className={`${styles.card} ${styles.completionCard}`}>
        <span className={styles.completionIcon}><CheckCircle2 size={32} /></span>
        <p>Assignment complete</p>
        <h2>{practiceAssignment.title}</h2>
        <div className={styles.completionScore}><strong>{correctCount}/{practiceAssignment.questions.length}</strong><span>{Math.round((correctCount / practiceAssignment.questions.length) * 100)}% accuracy</span></div>
        <p>Your answers have been saved. Review any mistakes to see the correct answer and worked reasoning again.</p>
        <div><button className={styles.secondaryButton} onClick={onBack}>Back to dashboard</button>{incorrectIndexes.length > 0 ? <button className={styles.primaryButton} onClick={() => goToQuestion(incorrectIndexes[0])}><RotateCcw size={16} /> Review mistakes</button> : null}</div>
      </section>
    );
  }

  return (
    <div className={styles.practiceLayout}>
      <section className={styles.card}>
        <div className={styles.practiceTop}><span>{practiceAssignment.title} · Question {questionIndex + 1} of {practiceAssignment.questions.length}</span><span><Clock3 size={15} /> Saved automatically</span></div>
        <ProgressBar value={Math.round(((questionIndex + (checked ? 1 : 0)) / practiceAssignment.questions.length) * 100)} />
        <div className={styles.questionBody}>
          <span className={styles.subjectTag}>{question.subject ?? practiceAssignment.subject} · {question.topic ?? practiceAssignment.topic}</span>
          <div className={styles.practiceStem}><MathText>{question.stem_md}</MathText></div>
          <div className={styles.answerOptions}>
            {Object.entries(question.options).map(([letter, answer]) => (
              <button className={`${selected === letter ? styles.answerSelected : ""} ${checked && letter === question.answer ? styles.answerCorrect : ""} ${checked && selected === letter && letter !== question.answer ? styles.answerWrong : ""}`} onClick={() => !checked && setSelected(letter)} key={letter}>
                <span>{letter}</span><MathText>{answer}</MathText>{checked && letter === question.answer ? <CheckCircle2 size={18} /> : null}
              </button>
            ))}
          </div>
          {checked ? <div className={selected === question.answer ? styles.explanation : styles.incorrectExplanation}><Lightbulb size={20} /><span><strong>{selected === question.answer ? "Correct — nice work." : `Not quite — the correct answer is ${question.answer}.`}</strong><MathText>{question.explanation_md}</MathText></span></div> : null}
          <div className={styles.practiceActions}><button className={styles.secondaryButton} onClick={() => notify("Hint: identify what changes inside and outside the function")}>Get a hint</button><button className={styles.primaryButton} disabled={!selected} onClick={checked ? nextQuestion : checkAnswer}>{checked ? questionIndex === practiceAssignment.questions.length - 1 ? "Finish assignment" : "Next question" : "Check answer"} <ArrowRight size={17} /></button></div>
        </div>
      </section>
      <aside className={styles.card}>
        <SectionTitle icon={Target} title="Session progress" />
        <div className={styles.sessionScore}><span>{correctCount}</span><small>correct</small><i /><span>{reviewCount}</span><small>to review</small></div>
        <div className={styles.navigator}>{practiceAssignment.questions.map((_, index) => <button onClick={() => goToQuestion(index)} className={index === questionIndex ? styles.currentQuestion : results[String(index)]?.correct ? styles.doneQuestion : results[String(index)] ? styles.reviewQuestion : ""} key={index}>{index + 1}</button>)}</div>
        <div className={styles.aiCallout}><BrainCircuit size={18} /><span><strong>Teacher assignment</strong>Your progress and final score are saved for this pilot.</span></div>
      </aside>
    </div>
  );
}

function RetryView({ onNavigate }: { onNavigate: (view: StudentView) => void }) {
  return (
    <>
      <div className={styles.statGrid}>
        <StatCard icon={RotateCcw} label="Questions to retry" value="18" change="+6 added this week" />
        <StatCard icon={BookOpen} label="Weak topics" value="4" change="Personalised for you" tone="blue" />
        <StatCard icon={Target} label="Retry accuracy" value="72%" change="+8% this month" tone="green" />
        <StatCard icon={Flame} label="Current streak" value="7 days" change="Keep it up!" tone="orange" />
      </div>
      <div className={styles.retryGrid}>
        <section className={styles.card}>
          <SectionTitle icon={RotateCcw} title="Retry incorrect answers" />
          <div className={styles.retryList}>
            {retryQuestions.map((question) => (
              <div key={question.id}><span>{question.id}</span><p><strong>{question.text}</strong><small>{question.subject}</small></p><i>{question.tag}</i><em>{question.level}</em><button onClick={() => onNavigate("practice")}>Retry now</button></div>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <SectionTitle icon={TrendingUp} title="Topics to focus on" />
          <div className={styles.topicProgress}>
            {[["Logarithmic functions", 38, "purple"], ["Probability", 52, "blue"], ["Time series", 60, "green"], ["Complex numbers", 75, "purple"]].map(([topic, score, tone]) => (
              <div key={topic as string}><span><strong>{topic as string}</strong><b>{score}%</b></span><ProgressBar value={score as number} tone={tone as string} /></div>
            ))}
          </div>
          <div className={styles.aiCallout}><Sparkles size={18} /><span><strong>Today’s plan</strong>6 questions · approximately 12 minutes</span></div>
        </section>
      </div>
    </>
  );
}

const teacherNav: { id: TeacherView; label: string; icon: IconType }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "assignment", label: "Create assignment", icon: WandSparkles },
  { id: "marking", label: "AI marking", icon: ClipboardCheck },
  { id: "classes", label: "Classes", icon: Users },
];

const studentNav: { id: StudentView; label: string; icon: IconType }[] = [
  { id: "overview", label: "My dashboard", icon: LayoutDashboard },
  { id: "practice", label: "Practice", icon: BookOpen },
  { id: "retry", label: "Mistakes & retry", icon: RotateCcw },
];

export function EducationCopilotMvp() {
  const [role, setRole] = useState<Role>("teacher");
  const [teacherView, setTeacherView] = useState<TeacherView>("overview");
  const [studentView, setStudentView] = useState<StudentView>("overview");
  const [toast, setToast] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<PilotAssignment[]>([]);
  const [progress, setProgress] = useState<Record<string, PilotProgress>>({});
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  useEffect(() => {
    const loadPilotState = () => {
      try {
        const savedAssignments = JSON.parse(window.localStorage.getItem(ASSIGNMENTS_STORAGE_KEY) ?? "[]") as PilotAssignment[];
        const savedProgress = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}") as Record<string, PilotProgress>;
        setAssignments(Array.isArray(savedAssignments) ? savedAssignments : []);
        setProgress(savedProgress && typeof savedProgress === "object" ? savedProgress : {});
      } catch {
        setAssignments([]);
        setProgress({});
      }
    };
    loadPilotState();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ASSIGNMENTS_STORAGE_KEY || event.key === PROGRESS_STORAGE_KEY) loadPilotState();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const currentView = role === "teacher" ? teacherView : studentView;
  const navItems = role === "teacher" ? teacherNav : studentNav;
  const copy = useMemo(() => {
    if (role === "student") {
      if (studentView === "practice") return ["Practice session", "Build confidence with VCE-style questions and instant feedback."];
      if (studentView === "retry") return ["Mistakes & retry queue", "Review incorrect answers, fix misconceptions, and build mastery."];
      return ["Welcome back, Jeff", "Continue your VCE revision and keep your momentum going."];
    }
    if (teacherView === "assignment") return ["Create assignment", "Generate a personalised, VCE-aligned assignment for your class."];
    if (teacherView === "marking") return ["AI-assisted marking", "Review suggested marks and feedback while you keep final control."];
    if (teacherView === "classes") return ["Class management", "Manage classes, students, assignments, and engagement."];
    return ["Teacher dashboard", "See where your class is thriving—and where support will make a difference."];
  }, [role, teacherView, studentView]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const publishAssignment = (draft: AssignmentDraft) => {
    const assignment: PilotAssignment = {
      ...draft,
      id: window.crypto.randomUUID?.() ?? `assignment-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: "published",
    };
    setAssignments((current) => {
      const next = [assignment, ...current];
      window.localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setActiveAssignmentId(assignment.id);
    return assignment.id;
  };

  const saveAssignmentProgress = (nextProgress: PilotProgress) => {
    setProgress((current) => {
      const next = { ...current, [nextProgress.assignmentId]: nextProgress };
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const startAssignment = (assignmentId: string) => {
    setActiveAssignmentId(assignmentId);
    setStudentView("practice");
  };

  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    if (nextRole === "student") setStudentView("overview");
    notify(`Switched to ${nextRole} demo`);
  };

  const activeAssignment = assignments.find((assignment) => assignment.id === activeAssignmentId) ?? null;

  return (
    <div className={styles.appShell}>
      <header className={styles.topbar}>
        <Logo />
        <div className={styles.topbarActions}>
          <span className={styles.demoPill}><Sparkles size={14} /> Interactive MVP</span>
          <button className={styles.notificationButton} aria-label="Notifications"><Bell size={19} /><i /></button>
          <button className={styles.profileButton}><span>JH</span><i>Jeff He<small>{role === "teacher" ? "Teacher" : "Student demo"}</small></i><ChevronDown size={16} /></button>
        </div>
      </header>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.roleSwitch}>
            <button className={role === "teacher" ? styles.roleActive : ""} onClick={() => changeRole("teacher")}><GraduationCap size={16} />Teacher</button>
            <button className={role === "student" ? styles.roleActive : ""} onClick={() => changeRole("student")}><UserRound size={16} />Student</button>
          </div>
          <nav>
            <p>{role === "teacher" ? "Teaching" : "Learning"}</p>
            {navItems.map((item) => {
              const Icon = item.icon;
              return <button className={currentView === item.id ? styles.navActive : ""} key={item.id} onClick={() => role === "teacher" ? setTeacherView(item.id as TeacherView) : setStudentView(item.id as StudentView)}><Icon size={18} />{item.label}{item.id === "marking" ? <span>23</span> : null}</button>;
            })}
          </nav>
          <div className={styles.sidebarHelp}><span><Sparkles size={17} /></span><strong>Built for VCE</strong><p>Aligned practice, analytics, and teacher-controlled AI support.</p><button onClick={() => notify("Product tour restarted")}>Restart product tour</button></div>
        </aside>

        <main className={styles.main}>
          <div className={styles.mobileNav}>
            <button className={role === "teacher" ? styles.mobileRoleActive : styles.mobileRoleButton} onClick={() => changeRole("teacher")}><GraduationCap size={13} />Teacher</button>
            <button className={role === "student" ? styles.mobileRoleActive : styles.mobileRoleButton} onClick={() => changeRole("student")}><UserRound size={13} />Student</button>
            <span className={styles.mobileDivider} />
            {navItems.map((item) => <button className={currentView === item.id ? styles.mobileActive : ""} key={item.id} onClick={() => role === "teacher" ? setTeacherView(item.id as TeacherView) : setStudentView(item.id as StudentView)}>{item.label}</button>)}
          </div>
          <section className={styles.pageHero}>
            <div><span className={styles.breadcrumb}>{role === "teacher" ? "Teacher workspace" : "Student workspace"} <ChevronRight size={13} /> {navItems.find((item) => item.id === currentView)?.label}</span><h1>{copy[0]}</h1><p>{copy[1]}</p></div>
            <div className={styles.heroActions}>
              {role === "teacher" && teacherView === "overview" ? <><button className={styles.secondaryButton} onClick={() => notify("Report downloaded")}><Download size={17} /> Export report</button><button className={styles.primaryButton} onClick={() => setTeacherView("assignment")}><Plus size={17} /> New assignment</button></> : null}
              {role === "student" && studentView === "overview" ? <button className={styles.primaryButton} onClick={() => assignments[0] ? startAssignment(assignments[0].id) : setStudentView("practice")}><BookOpen size={17} /> {assignments[0] ? "Start latest assignment" : "Start practice"}</button> : null}
            </div>
          </section>

          {role === "teacher" && teacherView === "overview" ? <TeacherOverview onNavigate={setTeacherView} /> : null}
          {role === "teacher" && teacherView === "assignment" ? <AssignmentBuilder notify={notify} onPublish={publishAssignment} /> : null}
          {role === "teacher" && teacherView === "marking" ? <MarkingAssistant notify={notify} /> : null}
          {role === "teacher" && teacherView === "classes" ? <ClassesView onNavigate={setTeacherView} notify={notify} /> : null}
          {role === "student" && studentView === "overview" ? <StudentOverview onNavigate={setStudentView} assignments={assignments} progress={progress} onStartAssignment={startAssignment} /> : null}
          {role === "student" && studentView === "practice" ? <PracticeView notify={notify} assignment={activeAssignment} progress={activeAssignment ? progress[activeAssignment.id] : undefined} onProgress={saveAssignmentProgress} onBack={() => setStudentView("overview")} /> : null}
          {role === "student" && studentView === "retry" ? <RetryView onNavigate={setStudentView} /> : null}
          <footer className={styles.footer}><Logo /><span>Demo data only · Education Copilot MVP · Victoria, Australia</span></footer>
        </main>
      </div>
      {toast ? <div className={styles.toast}><CheckCircle2 size={18} />{toast}<button onClick={() => setToast(null)}><X size={15} /></button></div> : null}
    </div>
  );
}
