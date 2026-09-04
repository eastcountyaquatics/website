// Pull the real message out of a failed Edge Function call.
//
// supabase-js only fills `data` on a 2xx response. When a function returns
// 4xx/5xx it raises a FunctionsHttpError and parks the response body on
// `error.context` -- so every specific, carefully-worded message our
// functions return ("Discount code X was not recognized or has expired",
// "Fall 10U is not currently open for registration", "This tournament
// invite has already been paid") was being thrown away and replaced with a
// generic "please try again". Parents retyping the same mistyped sibling
// code with no idea what was wrong is a support call every time.
//
// Usage:
//   const { data, error } = await supabaseClient.functions.invoke(...);
//   if (error || !data) {
//     msg.textContent = await functionErrorMessage(error, data, "Fallback text.");
//   }
async function functionErrorMessage(error, data, fallback) {
  if (data && data.error) return data.error;

  const context = error && error.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      if (body && body.error) return String(body.error);
    } catch (e) {
      // Body wasn't JSON (a gateway error page, say) -- fall through.
    }
  }

  // supabase-js's own wrapper text ("Edge Function returned a non-2xx
  // status code") tells the user nothing, so prefer the fallback over it.
  if (error && error.message && !/non-2xx status code/i.test(error.message)) {
    return error.message;
  }
  return fallback;
}
