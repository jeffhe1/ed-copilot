"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignUpFormShadcn from "@/components/SignUpFormShadcn";

function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pw,
      });
      if (error) throw error;
      router.push("/profile");
    } catch (e: any) {
      setErr(e?.message ?? "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

  return (
    <main className="flex-1 page-bg min-h-0">
      <div className="mx-auto max-w-lg px-4 sm:px-6 py-10 sm:py-14">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "sign-in" ? "Sign in" : "Create an account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Use your account to access quizzes, analytics, and saved attempts.
            </p>
          </div>

          <div className="mt-5 inline-flex rounded-full border border-border bg-muted/50 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode("sign-in")}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                mode === "sign-in"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("sign-up")}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                mode === "sign-up"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign up
            </button>
          </div>

          <div className="mt-6">
            {mode === "sign-in" ? (
              <SignInForm />
            ) : (
              <SignUpFormShadcn />
            )}
          </div>

          <div className="mt-6 flex justify-between text-xs text-muted-foreground">
            <span>Need a place to start?</span>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app">Open the app</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
