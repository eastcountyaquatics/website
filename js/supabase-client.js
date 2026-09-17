// Supabase project connection details.
// The publishable key below is safe to expose in client-side code —
// it only allows the actions permitted by this project's Row Level Security policies.
const SUPABASE_URL = "https://kdlkkucvdqmcaujhvrwq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wMsLq2-dfG8fWL7gobDJqQ_FNgF50M_";

// "Stay Signed In" (login.html) toggles whether a session survives a closed
// browser (localStorage, the default -- unchanged from before this existed)
// or disappears when the tab/browser closes (sessionStorage). The choice is
// a harmless preference bit, always kept in localStorage so every page's
// freshly-constructed client agrees on where to find the real session.
function eca_authStorage() {
  try {
    return localStorage.getItem("eca_remember_me") === "0" ? sessionStorage : localStorage;
  } catch (e) {
    return localStorage;
  }
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: eca_authStorage() },
});
