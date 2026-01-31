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
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Bar({ ratio, ariaLabel }: { ratio: number; ariaLabel?: string }) {
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

/* ========================= Main Component ========================= */

export function StudentProfileCard() {
  const [loadingUser, setLoadingUser] = useState(true);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const [student, setStudent] = useState<StudentRow | null>(null);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // bumping this will re-run both effects below
  const [refreshTick, setRefreshTick] = useState(0);

  // load auth user (once + on auth change)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setAuthErr(error.message);
      } else {
        setAuthErr(null);
      }
      setAuthUserId(data.user?.id ?? null);
      setLoadingUser(false);
    })();

    // Listen for auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setAuthErr(null); // Clear error on successful sign in
        setAuthUserId(session.user.id);
        setRefreshTick((x) => x + 1);
      } else if (event === "SIGNED_OUT") {
        setAuthErr(null); // Clear error on sign out
        setAuthUserId(null);
        setRefreshTick((x) => x + 1);
      } else if (event === "USER_UPDATED" && session?.user) {
        setAuthUserId(session.user.id);
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        setAuthUserId(session.user.id);
      } else if (!session) {
        setAuthUserId(null);
      }
    });

    return () => {
      mounted = false;
      try {
        sub?.subscription?.unsubscribe();
      } catch {}
    };
  }, []);

  // Helper function to format auth error messages
  const formatAuthError = (errorMessage: string): string => {
    const lower = errorMessage.toLowerCase();
    if (lower.includes("invalid login credentials") || 
        lower.includes("invalid email or password") ||
        lower.includes("invalid password")) {
      return "Invalid email or password. Please check your credentials and try again.";
    } else if (lower.includes("user not found") || 
               lower.includes("does not exist") ||
               lower.includes("no user found")) {
      return "No account found with this email address. Please check your email or sign up.";
    } else if (lower.includes("email not confirmed") ||
               lower.includes("email not verified")) {
      return "Please confirm your email address before signing in.";
    } else if (lower.includes("too many requests") ||
               lower.includes("rate limit")) {
      return "Too many login attempts. Please wait a moment and try again.";
    }
    return errorMessage;
  };

  // Monitor for auth errors from URL hash (Supabase redirects errors here)
  useEffect(() => {
    if (authUserId) {
      setAuthErr(null); // Clear errors when user is authenticated
      return;
    }

    // Check URL hash for auth errors (Supabase auth errors appear in hash)
    const checkForErrors = () => {
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const error = params.get("error_description") || params.get("error");
        if (error) {
          const decodedError = decodeURIComponent(error);
          setAuthErr(formatAuthError(decodedError));
          // Clean up URL hash after reading error
          const url = new URL(window.location.href);
          url.hash = "";
          window.history.replaceState(null, "", url.toString());
        }
      }
    };

    // Check immediately and also listen for hash changes
    checkForErrors();
    window.addEventListener("hashchange", checkForErrors);
    
    return () => {
      window.removeEventListener("hashchange", checkForErrors);
    };
  }, [authUserId]);

  const fetchStudentRow = useCallback(async (uid: string) => {
    setErr(null);

    try {
      // First, ensure student exists in Supabase
      const { data: existing, error: fetchErr } = await supabase
        .from("Student")
        .select("*")
        .eq("authUserId", uid)
        .maybeSingle();

      if (fetchErr) {
        console.error("[StudentProfileCard] Error fetching student from Supabase:", fetchErr);
        setErr(fetchErr.message);
        return null;
      }

      if (!existing) {
        console.log(`[StudentProfileCard] Student not found in Supabase Student table, creating...`);
        // create if not exists in Supabase
        const { data: u, error: getUserError } = await supabase.auth.getUser();
        if (getUserError) {
          console.error("[StudentProfileCard] Error getting user from auth:", getUserError);
        }
        
        const email = u.user?.email ?? "";
        const name =
          (u.user?.user_metadata as any)?.full_name ??
          (u.user?.user_metadata as any)?.name ??
          (email ? email.split("@")[0] : "New Student");

        console.log(`[StudentProfileCard] Creating student with email=${email}, name=${name}`);

        const { data: created, error: upsertErr } = await supabase
          .from("Student")
          .upsert({ authUserId: uid, email, name }, { onConflict: "authUserId" })
          .select("*")
          .single();

        if (upsertErr) {
          console.error("[StudentProfileCard] Error creating student in Supabase:", upsertErr);
          setErr(upsertErr.message);
          return null;
        }
        
        console.log(`[StudentProfileCard] Successfully created student in Supabase:`, created);
        setStudent(created as StudentRow);
        
        // Ensure student exists in Prisma as well (use created values)
        try {
          console.log(`[StudentProfileCard] Ensuring student exists in Prisma...`);
          const ensureRes = await fetch("/api/ensure-student", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authUserId: uid, email: created.email, name: created.name }),
          });
          
          if (!ensureRes.ok) {
            const errorText = await ensureRes.text();
            console.error("[StudentProfileCard] ensure-student returned error:", ensureRes.status, errorText);
          } else {
            const ensureData = await ensureRes.json();
            console.log(`[StudentProfileCard] ensure-student success:`, ensureData);
          }
        } catch (ensureErr) {
          console.error("[StudentProfileCard] Error ensuring student in Prisma:", ensureErr);
          // Non-fatal, continue anyway
        }
        
        return created as StudentRow;
      }

      console.log(`[StudentProfileCard] Found existing student in Supabase:`, existing);

      setStudent(existing as StudentRow);
      
      // Ensure student exists in Prisma (in case it was only in Supabase)
      try {
        console.log(`[StudentProfileCard] Ensuring existing student is in Prisma...`);
        const ensureRes = await fetch("/api/ensure-student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authUserId: uid,
            email: existing.email,
            name: existing.name,
          }),
        });
        
        if (!ensureRes.ok) {
          const errorText = await ensureRes.text();
          console.error("[StudentProfileCard] ensure-student returned error:", ensureRes.status, errorText);
        } else {
          const ensureData = await ensureRes.json();
          console.log(`[StudentProfileCard] ensure-student success:`, ensureData);
        }
      } catch (ensureErr) {
        console.error("[StudentProfileCard] Error ensuring student in Prisma:", ensureErr);
        // Non-fatal, continue anyway
      }
      
      return existing as StudentRow;
    } catch (e: any) {
      console.error("[StudentProfileCard] Error in fetchStudentRow:", e);
      setErr(e?.message ?? "Failed to fetch student");
      return null;
    }
  }, []);

  const fetchAnalytics = useCallback(async (uid: string, retryCount = 0) => {
    try {
      setErr(null); // Clear previous errors
      console.log(`[StudentProfileCard] Fetching analytics for authUserId: ${uid} (attempt ${retryCount + 1})`);
      
      const res = await fetch("/api/student-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authUserId: uid }),
      });
      
      const json = await res.json();
      console.log(`[StudentProfileCard] Analytics response status: ${res.status}`, {
        hasBySubject: !!json.bySubject,
        hasOverview: !!json.overview,
        subjectsCount: json.bySubject?.length || 0,
      });
      
      if (!res.ok) {
        // If student not found and we haven't retried, wait a bit and retry (in case of timing issue)
        if ((res.status === 404 || res.status === 400) && retryCount < 2) {
          console.log(`[StudentProfileCard] Retrying analytics fetch after delay...`);
          await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms
          return fetchAnalytics(uid, retryCount + 1);
        }
        // If we get an error after retries, use empty data structure instead
        if (res.status === 404 || res.status === 400) {
          console.warn(`[StudentProfileCard] Using empty data structure after ${retryCount + 1} attempts`);
          setData({
            bySubject: [],
            overview: { attempts: 0, accuracy: 0, mastery: 0 },
          });
          return;
        }
        throw new Error(json?.error || "Failed to load analytics");
      }
      
      // Ensure we have the expected structure
      if (json && typeof json === "object" && json.bySubject && json.overview) {
        setData({
          bySubject: Array.isArray(json.bySubject) ? json.bySubject : [],
          overview: json.overview || { attempts: 0, accuracy: 0, mastery: 0 },
        });
        console.log(`[StudentProfileCard] Successfully set analytics data:`, {
          subjectsCount: json.bySubject.length,
          totalAttempts: json.overview.attempts,
        });
      } else {
        console.error("[StudentProfileCard] Invalid response format:", json);
        throw new Error("Invalid response format");
      }
    } catch (e: any) {
      console.error("[StudentProfileCard] Failed to fetch analytics:", e);
      setErr(e?.message ?? "Failed to load analytics");
      // Set empty data on error so UI still renders
      setData({
        bySubject: [],
        overview: { attempts: 0, accuracy: 0, mastery: 0 },
      });
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
      const studentRow = await fetchStudentRow(authUserId);
      if (cancelled) return;
      
      // Only fetch analytics after student is confirmed to exist
      // Wait a bit to ensure Prisma can see the student if it was just created
      if (studentRow) {
        // Small delay to ensure database consistency
        await new Promise((resolve) => setTimeout(resolve, 100));
        await fetchAnalytics(authUserId);
      } else {
        // If student creation failed, still try to fetch analytics (will return empty data)
        await fetchAnalytics(authUserId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, refreshTick, fetchStudentRow, fetchAnalytics]);

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
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Student Profile</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to see your progress and category stats.
          </p>
          
          {/* Display authentication errors */}
          {authErr && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-destructive mt-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <div className="text-sm font-medium text-destructive">Authentication Error</div>
                  <div className="mt-1 text-sm text-destructive/90">{authErr}</div>
                </div>
                <button
                  onClick={() => setAuthErr(null)}
                  className="text-destructive/70 hover:text-destructive transition-colors"
                  aria-label="Dismiss error"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          <div className="mt-5">
            <Auth 
              supabaseClient={supabase} 
              appearance={{ theme: ThemeSupa }} 
              providers={[]}
            />
          </div>
        </div>
      </aside>
    );
  }

  // Skeleton / loading
  if (loadingUser || (authUserId && !student)) {
    return (
      <aside className="w-full lg:w-80 xl:w-96">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded-md bg-muted/80" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-muted/60" />
        </div>
      </aside>
    );
  }

  // TypeScript guard - student should never be null here due to earlier check
  if (!student) {
    return null;
  }

  const overview = data?.overview;
  const subjects = data?.bySubject ?? [];

  return (
    <aside className="w-full lg:w-80 xl:w-96">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight tracking-tight truncate">{student.name || "Student"}</h2>
            <div className="text-sm text-muted-foreground break-all mt-0.5">{student.email || "—"}</div>
          </div>

          {/* Actions stacked vertically */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              className="rounded-lg border border-border bg-muted/50 hover:bg-accent px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
              aria-label="Refresh profile and analytics"
            >
              {refreshing ? (
                <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3l3-3-3-3v3A11 11 0 001 12h3z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M4 4v4h.01L7 5.01A6 6 0 1110 18a6 6 0 01-5.657-3.97l1.886-.668A4 4 0 1010 16a4 4 0 00-3.873-5H4z" />
                </svg>
              )}
              Refresh
            </button>

            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border border-border bg-muted/50 hover:bg-accent px-3 py-1.5 text-xs font-medium transition-colors"
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
        <div className="my-6 h-px w-full bg-border" />

        {/* Per-Subject — scrollable */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold tracking-tight">Performance by Subject</div>
              <p className="mt-1 text-xs text-muted-foreground">Scroll to see all subjects.</p>
            </div>
          </div>

          <div
            className="mt-4 space-y-4 max-h-80 xl:max-h-[28rem] overflow-y-auto pr-1"
            style={{ scrollbarGutter: "stable" }}
          >
            {subjects.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed border-border bg-muted/30">
                No activity yet.
              </div>
            )}

            {subjects.map((row) => (
              <div key={row.subject} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{row.subject}</div>
                  <div className="text-xs text-muted-foreground">
                    Attempted:{" "}
                    <span className="font-semibold text-foreground">{row.attempted}</span>
                  </div>
                </div>

                {/* Accuracy */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Accuracy</span>
                    <span className="font-medium text-foreground">{pct(row.accuracy)}%</span>
                  </div>
                  <div className="mt-1">
                    <Bar ratio={row.accuracy} ariaLabel={`Accuracy ${pct(row.accuracy)}%`} />
                  </div>
                </div>

                {/* Mastery */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Mastery</span>
                    <span className="font-medium text-foreground">
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

        {/* Error - show above content if present */}
        {err && (
          <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-destructive mt-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-destructive">Error loading data</div>
                <div className="mt-1 text-sm text-destructive/90">{err}</div>
              </div>
              <button
                onClick={() => setErr(null)}
                className="text-destructive/70 hover:text-destructive transition-colors"
                aria-label="Dismiss error"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default StudentProfileCard;