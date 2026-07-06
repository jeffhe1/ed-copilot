"use client";

import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  MousePointer2,
  School,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import styles from "./education-copilot-website.module.css";

const workflow = [
  {
    number: "01",
    icon: Sparkles,
    title: "Teacher sets the learning intention",
    copy: "Choose the VCE subject, topic, difficulty and number of questions. Education Copilot creates an editable first draft.",
  },
  {
    number: "02",
    icon: ClipboardCheck,
    title: "Teacher reviews and publishes",
    copy: "Nothing reaches students until the teacher is happy. Questions, answers and explanations remain teacher-controlled.",
  },
  {
    number: "03",
    icon: GraduationCap,
    title: "Students practise with useful feedback",
    copy: "Students complete the assignment in a focused workspace and receive worked reasoning after an incorrect response.",
  },
  {
    number: "04",
    icon: BarChart3,
    title: "Teachers see what needs attention",
    copy: "Class results surface common misconceptions, completion and areas for the next lesson or intervention.",
  },
];

const trustItems = [
  {
    icon: LockKeyhole,
    title: "Minimal-data pilot",
    copy: "The demonstration does not require real student names or sensitive school information.",
  },
  {
    icon: ShieldCheck,
    title: "Teacher-controlled AI",
    copy: "Educators review generated content and decide what is published, assigned and assessed.",
  },
  {
    icon: FileCheck2,
    title: "Procurement-ready direction",
    copy: "We are preparing the privacy, security and data-handling documentation schools need for a live pilot.",
  },
  {
    icon: BookOpenCheck,
    title: "Built around VCE practice",
    copy: "The product is being shaped for Victorian classrooms, subject language and teacher workflows.",
  },
];

const pilotSteps = [
  "One or two participating VCE classes",
  "Teacher onboarding and supported setup",
  "A focused 4–6 week classroom trial",
  "Teacher and student feedback checkpoints",
  "A school-ready impact and learnings report",
];

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <BookOpenCheck size={21} strokeWidth={2.3} />
    </span>
  );
}

function ProductPreview() {
  return (
    <div className={styles.productScene} aria-label="Education Copilot teacher and student product preview">
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />
      <div className={styles.productWindow}>
        <div className={styles.windowBar}>
          <span><i /><i /><i /></span>
          <div className={styles.windowBrand}><BrandMark /> Education Copilot</div>
          <span className={styles.livePill}><i /> Interactive pilot</span>
        </div>
        <div className={styles.productBody}>
          <aside className={styles.productSidebar}>
            <strong>TEACHING</strong>
            <span className={styles.activeSide}><LayoutDashboard size={13} /> Dashboard</span>
            <span><Sparkles size={13} /> Create assignment</span>
            <span><ClipboardCheck size={13} /> AI marking</span>
            <span><Users size={13} /> Classes</span>
          </aside>
          <div className={styles.productContent}>
            <div className={styles.previewTopline}>
              <div><small>11 METHODS · UNIT 3</small><h3>Where does your class need you next?</h3></div>
              <button>New assignment <ArrowRight size={12} /></button>
            </div>
            <div className={styles.miniStats}>
              <span><small>Class accuracy</small><b>76%</b><em>+8% this term</em></span>
              <span><small>Completion</small><b>92%</b><em>23 of 25 students</em></span>
              <span><small>Needs support</small><b>4</b><em>Review suggested</em></span>
            </div>
            <div className={styles.previewGrid}>
              <div className={styles.masteryCard}>
                <div className={styles.cardHeading}><span><BarChart3 size={14} /> Topic mastery</span><small>This week</small></div>
                {["Functions & graphs", "Probability", "Calculus", "Transformations"].map((topic, index) => (
                  <div className={styles.masteryRow} key={topic}>
                    <strong>{topic}</strong>
                    <span><i style={{ width: `${[82, 68, 58, 74][index]}%` }} /></span>
                    <b>{[82, 68, 58, 74][index]}%</b>
                  </div>
                ))}
                <div className={styles.teacherCue}><BrainCircuit size={15} /><span><b>Suggested next step</b> Revisit inverse log transformations with the class.</span></div>
              </div>
              <div className={styles.insightCard}>
                <div className={styles.cardHeading}><span><Target size={14} /> Misconceptions</span></div>
                <div><i>1</i><span>Shifting log graphs vertically</span><b>42%</b></div>
                <div><i>2</i><span>Domain restrictions</span><b>31%</b></div>
                <div><i>3</i><span>Inverse functions</span><b>24%</b></div>
                <button>View class insight <ChevronRight size={12} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.studentCard}>
        <div className={styles.studentCardTop}><span><GraduationCap size={14} /> Student feedback</span><small>Question 4 of 10</small></div>
        <strong>Not quite — the correct answer is B.</strong>
        <p>Subtracting 3 from the function output shifts every point vertically down by 3 units.</p>
        <div className={styles.studentProgress}><i /><span>Reasoning, not just an answer</span></div>
      </div>
      <div className={styles.floatingBadge}><CheckCircle2 size={16} /><span><b>Teacher reviewed</b> Ready to publish</span></div>
    </div>
  );
}

export function EducationCopilotWebsite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [formNotice, setFormNotice] = useState(false);

  function handlePilotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormNotice(true);
  }

  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/website" aria-label="Education Copilot website home">
            <BrandMark />
            <span>Education Copilot<small>Built for Victorian schools</small></span>
          </Link>
          <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`} aria-label="Main navigation">
            <a href="#product" onClick={() => setMenuOpen(false)}>Product</a>
            <a href="#approach" onClick={() => setMenuOpen(false)}>Our approach</a>
            <a href="#trust" onClick={() => setMenuOpen(false)}>Trust & privacy</a>
            <a href="#team" onClick={() => setMenuOpen(false)}>Team</a>
            <Link className={styles.mobileDemoLink} href="/">Try the demo <ArrowRight size={15} /></Link>
          </nav>
          <div className={styles.headerActions}>
            <a className={styles.textButton} href="#pilot">Book a school pilot</a>
            <Link className={styles.headerCta} href="/">Try interactive demo <ArrowRight size={14} /></Link>
          </div>
          <button className={styles.menuButton} aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((current) => !current)}>
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroNoise} />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><span><i /> Melbourne, Victoria</span><b>Interactive school pilot</b></div>
              <h1>Better VCE practice.<br />Less marking.<br /><em>Teachers stay in control.</em></h1>
              <p>Education Copilot helps Victorian teachers create VCE-style practice, give students meaningful feedback and see the misconceptions that matter—without handing the classroom over to AI.</p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryCta} href="/"><MousePointer2 size={17} /> Explore the interactive demo <ArrowRight size={16} /></Link>
                <a className={styles.secondaryCta} href="#pilot">Discuss a school pilot <ChevronRight size={16} /></a>
              </div>
              <div className={styles.heroProof}>
                <span><Check size={14} /> No real student data needed</span>
                <span><Check size={14} /> Teacher-reviewed content</span>
                <span><Check size={14} /> Designed around VCE</span>
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className={styles.trustStrip} aria-label="Product principles">
          <div><span><School size={20} /></span><p><b>Victorian by design</b><small>Built around local classrooms</small></p></div>
          <div><span><BookOpenCheck size={20} /></span><p><b>VCE-focused practice</b><small>Familiar subject language</small></p></div>
          <div><span><ShieldCheck size={20} /></span><p><b>Teacher in the loop</b><small>Review before publishing</small></p></div>
          <div><span><HeartHandshake size={20} /></span><p><b>Supported pilots</b><small>We learn alongside your school</small></p></div>
        </section>

        <section className={styles.problemSection} id="product">
          <div className={styles.sectionHeading}>
            <span>THE CLASSROOM REALITY</span>
            <h2>Teachers do not need another dashboard.<br />They need time and useful signals.</h2>
            <p>Education Copilot turns one clear teacher intention into a connected teaching and learning workflow.</p>
          </div>
          <div className={styles.outcomeGrid}>
            <article className={styles.outcomeCard}>
              <div className={styles.outcomeIcon}><Zap size={22} /></div>
              <span>FOR TEACHERS</span>
              <h3>Create strong practice faster</h3>
              <p>Generate an editable starting point, choose the number and difficulty of questions, then publish only what meets your standard.</p>
              <ul><li><Check size={14} /> VCE-style question generation</li><li><Check size={14} /> Editable answers and explanations</li><li><Check size={14} /> Class-level misconception insights</li></ul>
            </article>
            <article className={`${styles.outcomeCard} ${styles.outcomeCardDark}`}>
              <div className={styles.outcomeIcon}><GraduationCap size={22} /></div>
              <span>FOR STUDENTS</span>
              <h3>Make every wrong answer useful</h3>
              <p>A calm practice space gives students immediate, worked feedback and lets them return to misconceptions rather than simply seeing a score.</p>
              <ul><li><Check size={14} /> Focused assignment experience</li><li><Check size={14} /> Correct answer with reasoning</li><li><Check size={14} /> Saved progress and retry flow</li></ul>
            </article>
            <article className={styles.outcomeCard}>
              <div className={styles.outcomeIcon}><BarChart3 size={22} /></div>
              <span>FOR SCHOOL LEADERS</span>
              <h3>Run a pilot you can evaluate</h3>
              <p>Start small, define success with teachers and build an evidence base before making any wider technology decision.</p>
              <ul><li><Check size={14} /> Clear pilot scope and support</li><li><Check size={14} /> Adoption and engagement signals</li><li><Check size={14} /> End-of-pilot learnings report</li></ul>
            </article>
          </div>
        </section>

        <section className={styles.workflowSection} id="approach">
          <div className={styles.sectionHeadingLeft}>
            <span>ONE CONNECTED WORKFLOW</span>
            <h2>From learning intention<br />to the next teaching decision.</h2>
            <p>AI handles the first draft and pattern-finding. Teachers retain the judgement.</p>
          </div>
          <div className={styles.workflowGrid}>
            {workflow.map(({ number, icon: Icon, title, copy }) => (
              <article key={number}>
                <div><span>{number}</span><Icon size={19} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className={styles.workflowCta}>
            <div><span><MousePointer2 size={18} /></span><p><b>See the complete flow yourself</b><small>Switch between Teacher and Student modes in the live product demonstration.</small></p></div>
            <Link href="/">Open interactive demo <ArrowRight size={15} /></Link>
          </div>
        </section>

        <section className={styles.visionSection}>
          <div className={styles.visionPanel}>
            <div className={styles.visionQuote}>
              <span>OUR VISION</span>
              <h2>AI should amplify great teaching—not replace the judgement behind it.</h2>
              <p>We are building Education Copilot around a simple idea: teachers should spend less time producing repetitive material and more time understanding, challenging and supporting the students in front of them.</p>
              <div><i /><p><b>Teacher agency is a product requirement.</b><small>Every important classroom action remains visible, editable and controlled by an educator.</small></p></div>
            </div>
            <div className={styles.visionValues}>
              <div><BrainCircuit size={20} /><p><b>Useful AI, quietly applied</b><small>No novelty features for their own sake.</small></p></div>
              <div><Target size={20} /><p><b>Evidence before expansion</b><small>Small pilots, clear measures, honest learning.</small></p></div>
              <div><HeartHandshake size={20} /><p><b>Built with schools</b><small>Teacher feedback shapes the product roadmap.</small></p></div>
            </div>
          </div>
        </section>

        <section className={styles.trustSection} id="trust">
          <div className={styles.sectionHeading}>
            <span>TRUST IS PART OF THE PRODUCT</span>
            <h2>Designed to start safely and earn confidence.</h2>
            <p>We know Victorian schools must examine privacy, security, child safety and information handling before adopting third-party software.</p>
          </div>
          <div className={styles.trustGrid}>
            {trustItems.map(({ icon: Icon, title, copy }) => <article key={title}><Icon size={21} /><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
          <div className={styles.trustNote}>
            <ShieldCheck size={24} />
            <div><b>Our position for school conversations</b><p>We will be transparent about what the MVP does today, what is required before real student data is introduced, and the controls being prepared for a live deployment. We will not describe the product as department-approved or ST4S-assessed until that process has genuinely occurred.</p></div>
          </div>
        </section>

        <section className={styles.teamSection} id="team">
          <div className={styles.teamCopy}>
            <span>THE TEAM</span>
            <h2>Local, accessible and ready to learn alongside educators.</h2>
            <p>Education Copilot is being built in Melbourne by a founding team focused on the intersection of education, responsible AI and practical product design.</p>
            <div className={styles.locationLine}><MapPin size={17} /><span><b>Melbourne, Victoria</b><small>Available for in-person pilot conversations and teacher feedback sessions.</small></span></div>
          </div>
          <div className={styles.teamCards}>
            <article>
              <div className={styles.teamAvatar}><GraduationCap size={24} /></div>
              <span>FOUNDING TEAM · PROFILE TO ADD</span>
              <h3>Education & school partnerships</h3>
              <p>Use this space for the founder’s name, connection to education, VCE experience and reason for building the company.</p>
            </article>
            <article>
              <div className={styles.teamAvatar}><BrainCircuit size={24} /></div>
              <span>FOUNDING TEAM · PROFILE TO ADD</span>
              <h3>Product & AI engineering</h3>
              <p>Use this space for the founder’s name, technical background, product responsibility and approach to responsible AI.</p>
            </article>
          </div>
        </section>

        <section className={styles.pilotSection} id="pilot">
          <div className={styles.pilotInner}>
            <div className={styles.pilotContent}>
              <span>FOUNDING SCHOOL PILOT</span>
              <h2>Help shape a tool built for the reality of Victorian classrooms.</h2>
              <p>We are looking for a small number of schools and VCE educators who want to test the workflow, challenge our assumptions and help define what a genuinely useful product looks like.</p>
              <ul>{pilotSteps.map((step) => <li key={step}><CheckCircle2 size={16} />{step}</li>)}</ul>
              <div className={styles.pilotMeta}><span><Clock3 size={17} /><b>4–6 weeks</b><small>Suggested pilot window</small></span><span><Users size={17} /><b>1–2 classes</b><small>Deliberately focused scope</small></span></div>
            </div>
            <form className={styles.pilotForm} onSubmit={handlePilotRequest}>
              <div className={styles.formHeading}><span><MessageCircle size={19} /></span><div><b>Start a pilot conversation</b><small>Tell us a little about your school.</small></div></div>
              <label>Your name<input required name="name" placeholder="e.g. Sarah Nguyen" /></label>
              <label>School<input required name="school" placeholder="Your school name" /></label>
              <label>School email<input required type="email" name="email" placeholder="name@school.vic.edu.au" /></label>
              <label>What would you like to explore?<textarea name="message" placeholder="Subjects, year levels or the challenge you want to solve" rows={4} /></label>
              <button type="submit">Request a conversation <ArrowRight size={15} /></button>
              {formNotice ? <p className={styles.formNotice}><Mail size={14} /> Contact routing is waiting for your team email. Nothing has been sent yet.</p> : <small className={styles.formPrivacy}><LockKeyhole size={12} /> Contact details will be used only to discuss the pilot.</small>}
            </form>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}><Link className={styles.brand} href="/website"><BrandMark /><span>Education Copilot<small>Better practice. Clearer insight.</small></span></Link><p>Teacher-controlled AI for Victorian secondary education.</p></div>
          <div><b>Explore</b><a href="#product">Product</a><a href="#approach">Our approach</a><Link href="/">Interactive demo</Link></div>
          <div><b>Schools</b><a href="#trust">Trust & privacy</a><a href="#pilot">Pilot program</a><a href="#team">Team</a></div>
          <div><b>Contact</b><span className={styles.pendingDetail}><Mail size={14} /> Email to be supplied</span><span className={styles.pendingDetail}><MapPin size={14} /> Melbourne, Victoria</span></div>
        </div>
        <div className={styles.footerBottom}><span>© 2026 Education Copilot. Pilot-stage product.</span><span>Built thoughtfully in Melbourne, Australia.</span></div>
      </footer>
    </div>
  );
}
