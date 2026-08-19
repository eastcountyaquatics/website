// Supabase project connection details.
// The publishable key below is safe to expose in client-side code —
// it only allows the actions permitted by this project's Row Level Security policies.
const SUPABASE_URL = "https://kdlkkucvdqmcaujhvrwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wMsLq2-dfG8fWL7gobDJqQ_FNgF50M_";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
