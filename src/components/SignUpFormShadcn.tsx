"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

/** Helpers */
const tenDigit = () =>
  Math.floor(1000000000 + Math.random() * 9000000000).toString();
const slugify = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
const buildUsername = (first: string, last: string) =>
  `${slugify(first)}${slugify(last)}${tenDigit()}`;

type Props = {
  /** Called after successful sign up (e.g. toggle back to sign-in UI) */
  onSuccess?: () => void;
};

export default function SignUpFormShadcn({ onSuccess }: Props) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (!first.trim() || !last.trim()) {
      setErr("Please enter your first and last name.");
      return;
    }
    if (!email.trim()) {
      setErr("Please enter a valid email.");
      return;
    }
    if (pw.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const username = buildUsername(first, last);

      const { data, error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          data: { firstName: first.trim(), lastName: last.trim(), username },
        },
      });
      if (error) throw error;

      // Optional: create/update your Student row here if you want to do it immediately
      if (data.user) {
        await supabase
          .from("Student")
          .upsert(
            { authUserId: data.user.id, email, name: `${first.trim()} ${last.trim()}` },
            { onConflict: "authUserId" }
          );
      }

      setMsg("Account created. You can now sign in.");
      setFirst("");
      setLast("");
      setEmail("");
      setPw("");

      // Let parent swap to sign-in
      onSuccess?.();
    } catch (e: any) {
      setErr(e?.message ?? "Sign-up failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="first">First name</Label>
          <Input
            id="first"
            type="text"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            required
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="last">Last name</Label>
          <Input
            id="last"
            type="text"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            required
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoComplete="new-password"
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
