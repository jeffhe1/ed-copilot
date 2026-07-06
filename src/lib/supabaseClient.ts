// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// Local/demo builds should still render the UI when hosted auth has not been configured.
// Supabase is inert with these loopback values; real deployments continue to use env vars.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'education-copilot-demo-key';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
