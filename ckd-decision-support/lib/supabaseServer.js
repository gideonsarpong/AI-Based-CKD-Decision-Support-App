// lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // Use service role key for server-side, notice no NEXT_PUBLIC_ prefix
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

