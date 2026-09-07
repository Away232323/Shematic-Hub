window.SUPABASE_URL = 'https://nqaqoaorwgwfixlxutbj.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FUpWl9SzzMbL6kcKu3Ga_A_gq7FGXl3';

window.supaClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
