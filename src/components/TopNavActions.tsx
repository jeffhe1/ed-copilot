"use client";
 
import { useEffect, useState } from "react";
 import Link from "next/link";
 
 import { supabase } from "@/lib/supabaseClient";
 import { Button } from "@/components/ui/button";
 
 export function TopNavActions() {
  const [displayName, setDisplayName] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
 
   useEffect(() => {
     let mounted = true;
 
    const getDisplayName = (user: { email?: string | null; user_metadata?: any }) => {
      const meta = user.user_metadata ?? {};
      return (
        meta.full_name ||
        meta.name ||
        (user.email ? user.email.split("@")[0] : null)
      );
    };

     (async () => {
       const { data } = await supabase.auth.getUser();
       if (!mounted) return;
      setDisplayName(data.user ? getDisplayName(data.user) : null);
       setLoading(false);
     })();
 
     const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setDisplayName(session?.user ? getDisplayName(session.user) : null);
       setLoading(false);
     });
 
     return () => {
       mounted = false;
       sub.subscription.unsubscribe();
     };
   }, []);
 
   if (loading) {
     return <div className="h-9 w-28 rounded-md bg-muted/60 animate-pulse" />;
   }
 
  if (!displayName) {
     return (
       <Button asChild size="sm">
         <Link href="/login">Sign in</Link>
       </Button>
     );
   }
 
   return (
     <Link
       href="/profile"
       className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
     >
      {displayName}
     </Link>
   );
 }
