"use client";

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

/* ============================== Types ============================== */

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

/* ============================ Helpers ============================= */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

function Bar({ ratio, ariaLabel }: { ratio: number; ariaLabel?: string }) {
  const r = clamp01(ratio);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200" aria-label={ariaLabel}>
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${pct(r)}%` }}
      />
    </div>
  );
}

/* ========================= Main Component ========================= */

export function StudentProfileCard() {
  const [loadingUser, setLoadingUser] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const [student, setStudent] = useState<StudentRow | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // bumping this will re-run both effects below
  const [refreshTick, setRefreshTick] = useState(0);

  // load auth user (once + on auth change)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setAuthUserId(data.user?.id ?? null);
      setLoadingUser(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthUserId(session?.user?.id ?? null);
      setRefreshTick((x) => x + 1);
    });

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe();
      } catch {}
    };
  }, []);

  const fetchStudentRow = useCallback(async (uid: string) => {
    setErr(null);

    const { data: existing, error: fetchErr } = await supabase
      .from("Student")
      .select("*")
      .eq("authUserId", uid)
      .maybeSingle();

    if (fetchErr) {
      setErr(fetchErr.message);
      return null;
    }

    if (existing) {
      setStudent(existing as StudentRow);
      return existing as StudentRow;
    }

    // create if not exists
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email ?? "";
    const name =
      (u.user?.user_metadata as any)?.full_name ??
      (email ? email.split("@")[0] : "New Student");

    const { data: created, error: upsertErr } = await supabase
      .from("Student")
      .upsert({ authUserId: uid, email, name }, { onConflict: "authUserId" })
      .select("*")
      .single();

    if (upsertErr) {
      setErr(upsertErr.message);
      return null;
    }
    setStudent(created as StudentRow);
    return created as StudentRow;
  }, []);

  const fetchAnalytics = useCallback(async (uid: string) => {
    try {
      const res = await fetch("/api/student-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authUserId: uid }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load analytics");
      setData(json as AnalyticsPayload);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load analytics");
    }
  }, []);

  // ensure Student row (runs on authUserId + refreshTick)
  useEffect(() => {
    if (!authUserId) {
      setStudent(null);
      setData(null);
      return;
    }
    let cancelled = false;

    (async () => {
      await fetchStudentRow(authUserId);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, refreshTick, fetchStudentRow]);

  // fetch analytics (runs on authUserId + refreshTick)
  useEffect(() => {
    if (!authUserId) return;
    let aborted = false;

    (async () => {
      await fetchAnalytics(authUserId);
      if (aborted) return;
    })();

    return () => {
      aborted = true;
    };
  }, [authUserId, refreshTick, fetchAnalytics]);

  // Manual refresh button handler
  const handleRefresh = async () => {
    if (!authUserId) return;
    setRefreshing(true);
    setRefreshTick((x) => x + 1);
    // stop spinner shortly after; data sections will update as state changes
    setTimeout(() => setRefreshing(false), 400);
  };

  /* ============================ RENDER ============================ */

  // Logged out view
  if (!loadingUser && !authUserId) {
    return (
      <aside className="w-full lg:w-80 xl:w-96">
        <div className="rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-semibold">Student Profile</h2>
          <p className="mt-1 text-sm text-gray-600">
            Sign in to see your progress and category stats.
          </p>
          <div className="mt-4">
            <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={[]} />
          </div>
        </div>
      </aside>
    );
  }

  // Skeleton / loading
  if (loadingUser || !student) {
    return (
      <aside className="w-full lg:w-80 xl:w-96">
        <div className="rounded-2xl border bg-white p-5 space-y-4">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-56 animate-pulse rounded bg-gray-100" />
          <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
          <div className="h-24 w-full animate-pulse rounded bg-gray-100" />
        </div>
      </aside>
    );
  }

  const overview = data?.overview;
  const subjects = data?.bySubject ?? [];

  return (
    <aside className="w-full lg:w-80 xl:w-96">
      <div className="rounded-2xl border bg-white p-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold leading-tight">{student.name || "Student"}</h2>
            <div className="text-sm text-gray-600 break-all">{student.email || "—"}</div>
          </div>

          {/* Actions stacked vertically */}
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleRefresh}
              className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50 inline-flex items-center gap-1"
              aria-label="Refresh profile and analytics"
            >
              {refreshing ? (
                <svg className="h-3 w-3 animate-spin text-gray-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3l3-3-3-3v3A11 11 0 001 12h3z" />
                </svg>
              ) : (
                <svg className="h-3 w-3 text-gray-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4 4v4h.01L7 5.01A6 6 0 1110 18a6 6 0 01-5.657-3.97l1.886-.668A4 4 0 1010 16a4 4 0 00-3.873-5H4z" />
                </svg>
              )}
              Refresh
            </button>

            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-1 gap-3">
          <Stat label="Total Attempted" value={overview ? overview.attempts : "—"} />
          <Stat
            label="Overall Accuracy"
            value={overview ? `${pct(overview.accuracy)}%` : "—"}
            sub="Correct / Attempted"
          />
          <Stat
            label="Overall Mastery"
            value={overview ? (Math.round(overview.mastery * 100) / 100).toFixed(2) : "—"}
            sub="Mean of skill masteries (0–1)"
          />
        </div>

        {/* Divider */}
        <div className="my-6 h-px w-full bg-gray-100" />

        {/* Per-Subject — scrollable */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Performance by Subject</div>
              <p className="mt-1 text-xs text-gray-500">Scroll to see all subjects.</p>
            </div>
          </div>

          <div
            className="mt-4 space-y-4 max-h-80 xl:max-h-[28rem] overflow-y-auto pr-1"
            style={{ scrollbarGutter: "stable" }}
          >
            {subjects.length === 0 && (
              <div className="text-sm text-gray-500">No activity yet.</div>
            )}

            {subjects.map((row) => (
              <div key={row.subject} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{row.subject}</div>
                  <div className="text-xs text-gray-500">
                    Attempted:{" "}
                    <span className="font-semibold text-gray-700">{row.attempted}</span>
                  </div>
                </div>

                {/* Accuracy */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Accuracy</span>
                    <span className="font-medium text-gray-800">{pct(row.accuracy)}%</span>
                  </div>
                  <div className="mt-1">
                    <Bar ratio={row.accuracy} ariaLabel={`Accuracy ${pct(row.accuracy)}%`} />
                  </div>
                </div>

                {/* Mastery */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Mastery</span>
                    <span className="font-medium text-gray-800">
                      {(Math.round(row.mastery * 100) / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar
                      ratio={row.mastery}
                      ariaLabel={`Mastery ${(Math.round(row.mastery * 100) / 100).toFixed(2)}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {err && <div className="mt-4 text-sm text-red-600">{err}</div>}
      </div>
    </aside>
  );
}

export default StudentProfileCard;
