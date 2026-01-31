"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

type StudentRow = {
  id: string;
  name: string;
  email: string;
  authUserId: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type SubjectRow = { subject: string; attempted: number; accuracy: number; mastery: number };
type Overview = { attempts: number; accuracy: number; mastery: number };
type AnalyticsPayload = { bySubject: SubjectRow[]; overview: Overview };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function ProgressBar({ ratio, ariaLabel }: { ratio: number; ariaLabel?: string }) {
  const r = clamp01(ratio);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-label={ariaLabel}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${pct(r)}%` }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const [loadingUser, setLoadingUser] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authName, setAuthName] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) setErr(error.message);
      if (data.user) {
        const meta = (data.user.user_metadata as { full_name?: string; name?: string } | null) ?? null;
        setAuthEmail(data.user.email ?? null);
        setAuthName(meta?.full_name ?? meta?.name ?? null);
      }
      setAuthUserId(data.user?.id ?? null);
      setLoadingUser(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = (session.user.user_metadata as { full_name?: string; name?: string } | null) ?? null;
        setAuthEmail(session.user.email ?? null);
        setAuthName(meta?.full_name ?? meta?.name ?? null);
      } else {
        setAuthEmail(null);
        setAuthName(null);
      }
      setAuthUserId(session?.user?.id ?? null);
      setLoadingUser(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fetchStudentRow = useCallback(async (uid: string) => {
    setErr(null);
    try {
      const email = authEmail ?? "";
      const name = authName ?? (email ? email.split("@")[0] : "New Student");

      const res = await fetch("/api/ensure-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authUserId: uid, email, name }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErr(json?.error || "Failed to ensure student");
        return null;
      }

      const ensured = json?.student as StudentRow | undefined;
      if (ensured) {
        setStudent(ensured);
        return ensured;
      }
      return null;
    } catch (e: any) {
      setErr(e?.message ?? "Failed to fetch student");
      return null;
    }
  }, [authEmail, authName]);

  const fetchAnalytics = useCallback(async (uid: string) => {
    try {
      let emailForAnalytics = student?.email ?? authEmail ?? undefined;
      let nameForAnalytics = student?.name ?? authName ?? undefined;
      if (!emailForAnalytics) {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) {
          emailForAnalytics = data.user.email;
          const meta = (data.user.user_metadata as { full_name?: string; name?: string } | null) ?? null;
          nameForAnalytics = meta?.full_name ?? meta?.name ?? nameForAnalytics;
        }
      }

      const res = await fetch("/api/student-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authUserId: uid,
          email: emailForAnalytics,
          name: nameForAnalytics,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setData({ bySubject: [], overview: { attempts: 0, accuracy: 0, mastery: 0 } });
        return;
      }

      setData({
        bySubject: Array.isArray(json.bySubject) ? json.bySubject : [],
        overview: json.overview || { attempts: 0, accuracy: 0, mastery: 0 },
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load analytics");
      setData({ bySubject: [], overview: { attempts: 0, accuracy: 0, mastery: 0 } });
    }
  }, []);

  useEffect(() => {
    if (!authUserId) {
      setStudent(null);
      setData(null);
      return;
    }
    let cancelled = false;

    (async () => {
      const studentRow = await fetchStudentRow(authUserId);
      if (cancelled) return;
      if (studentRow) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await fetchAnalytics(authUserId);
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, fetchStudentRow, fetchAnalytics]);

  const handleRefresh = async () => {
    if (!authUserId) return;
    setRefreshing(true);
    await fetchStudentRow(authUserId);
    await fetchAnalytics(authUserId);
    setTimeout(() => setRefreshing(false), 300);
  };

  return (
    <main className="flex-1 page-bg min-h-0">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Your profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review your learning progress and performance by subject.
            </p>
          </div>

          {loadingUser ? (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
              <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded-md bg-muted/80" />
              <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
              <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
            </div>
          ) : !authUserId ? (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight">Sign in to view your profile</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Access your saved attempts, accuracy, and mastery insights.
              </p>
              <div className="mt-4">
                <Button asChild>
                  <Link href="/login">Go to sign in</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight truncate">
                      {student?.name || "Student"}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1 break-all">
                      {student?.email || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleRefresh}>
                      {refreshing ? "Refreshing..." : "Refresh"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => supabase.auth.signOut()}
                    >
                      Sign out
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Total Attempted" value={data?.overview.attempts ?? "—"} />
                <StatCard
                  label="Overall Accuracy"
                  value={data ? `${pct(data.overview.accuracy)}%` : "—"}
                  sub="Correct / Attempted"
                />
                <StatCard
                  label="Overall Mastery"
                  value={
                    data
                      ? (Math.round(data.overview.mastery * 100) / 100).toFixed(2)
                      : "—"
                  }
                  sub="Mean of skill masteries (0–1)"
                />
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold tracking-tight">Performance by Subject</div>
                    <p className="mt-1 text-xs text-muted-foreground">Scroll to see all subjects.</p>
                  </div>
                </div>

                <div
                  className="mt-4 space-y-4 max-h-[30rem] overflow-y-auto pr-1"
                  style={{ scrollbarGutter: "stable" }}
                >
                  {data?.bySubject?.length ? (
                    data.bySubject.map((row) => (
                      <div key={row.subject} className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium">{row.subject}</div>
                          <div className="text-xs text-muted-foreground">
                            Attempted:{" "}
                            <span className="font-semibold text-foreground">{row.attempted}</span>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Accuracy</span>
                            <span className="font-medium text-foreground">{pct(row.accuracy)}%</span>
                          </div>
                          <div className="mt-1">
                            <ProgressBar ratio={row.accuracy} ariaLabel={`Accuracy ${pct(row.accuracy)}%`} />
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Mastery</span>
                            <span className="font-medium text-foreground">
                              {(Math.round(row.mastery * 100) / 100).toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-1">
                            <ProgressBar
                              ratio={row.mastery}
                              ariaLabel={`Mastery ${(Math.round(row.mastery * 100) / 100).toFixed(2)}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
                      No activity yet.
                    </div>
                  )}
                </div>
              </div>

              {err && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {err}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
