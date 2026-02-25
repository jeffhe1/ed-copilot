"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

export function LandingCtaButtons() {
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsSignedIn(!!data.user);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsSignedIn(!!session?.user);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild>
        <Link href="/app">Open the app</Link>
      </Button>
      {isSignedIn !== true && (
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      )}
    </div>
  );
}
