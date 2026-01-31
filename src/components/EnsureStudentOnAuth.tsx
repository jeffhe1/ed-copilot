"use client";

import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabaseClient";

type UserMetadata = { full_name?: string; name?: string } | null;

export function EnsureStudentOnAuth() {
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const ensureStudent = async (user: User) => {
      if (!mounted) return;
      if (!user?.id || lastUserIdRef.current === user.id) return;
      lastUserIdRef.current = user.id;

      const metadata = (user.user_metadata as UserMetadata) ?? null;
      const email = user.email ?? "";
      const name =
        metadata?.full_name ??
        metadata?.name ??
        (email ? email.split("@")[0] : "New Student");

      try {
        await fetch("/api/ensure-student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authUserId: user.id, email, name }),
        });
      } catch {
        // Non-blocking; analytics/attempts will still render if created later
      }
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await ensureStudent(data.user);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ensureStudent(session.user);
      } else {
        lastUserIdRef.current = null;
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
