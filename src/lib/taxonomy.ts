// lib/taxonomy.ts
export const AREAS = [
  "Mathematics","Physics","Chemistry","Biology","English","Languages","Computer Science"
] as const;
export type Area = typeof AREAS[number];

export const SUBJECTS: Record<Area, string[]> = {
  Mathematics: ["Algebra","Functions","Calculus","Probability","Statistics","Geometry","Trigonometry"],
  Physics: ["Mechanics","Waves","Electricity","Modern Physics","Thermodynamics"],
  Chemistry: ["Stoichiometry","Atomic Structure","Bonding","Thermochemistry","Equilibrium","Acids & Bases","Redox"],
  Biology: ["Cell Biology","Genetics","Evolution","Human Physiology","Ecology"],
  English: ["Reading","Writing","Language Analysis","Argument"],
  Languages: ["Vocabulary","Grammar","Listening","Reading","Writing","Speaking"],
  "Computer Science": ["Algorithms","Data Structures","Complexity","Programming"]
};

export const TOPICS: Record<string, string[]> = {
  Algebra: ["Linear Equations","Quadratics","Inequalities","Exponentials","Logs","Polynomials"],
  Calculus: ["Limits","Derivatives","Applications of Derivatives","Integrals","Series","Differential Equations"],
  Probability: ["Combinatorics","Discrete RVs","Continuous RVs","Bayes","Markov Chains"],
  // …add the rest as you teach them
};

export function isValidPath(area: string, subject: string, topic: string) {
  return AREAS.includes(area as Area)
    && SUBJECTS[area as Area]?.includes(subject)
    && TOPICS[subject]?.includes(topic);
}
