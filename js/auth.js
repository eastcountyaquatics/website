// Shared auth-state UI: populates the nav "account" slot on every page
// and (optionally) guards pages that require a signed-in user or a staff role.

async function getUserRole(userId) {
  const { data } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data ? data.role : null;
}

async function renderNavAuthSlot(session) {
  const slot = document.getElementById("nav-auth-slot");
  if (!slot) return;

  if (session) {
    const role = await getUserRole(session.user.id);
    const adminLink = role ? '<a href="admin.html">Admin</a>' : "";
    slot.innerHTML =
      adminLink +
      '<a href="dashboard.html">My Account</a>' +
      '<a href="#" id="nav-sign-out">Sign Out</a>';
    const signOutLink = document.getElementById("nav-sign-out");
    signOutLink.addEventListener("click", async function (e) {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  } else {
    slot.innerHTML = '<a href="login.html">Sign In</a>';
  }
}

async function initAuthNav() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  renderNavAuthSlot(session);

  supabaseClient.auth.onAuthStateChange(function (_event, newSession) {
    renderNavAuthSlot(newSession);
  });

  return session;
}

// Call on pages that require a signed-in user (e.g. dashboard.html).
// Redirects to login.html if there is no active session.
async function requireAuth() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

// Call on admin pages. Redirects to login.html if signed out, or to
// dashboard.html if signed in but not an owner/coach/staff account.
// Pass e.g. ["owner"] to further restrict a page to just owners.
async function requireRole(allowedRoles) {
  const session = await requireAuth();
  if (!session) return null;

  const role = await getUserRole(session.user.id);
  const roles = allowedRoles || ["owner", "coach", "staff"];
  if (!role || roles.indexOf(role) === -1) {
    window.location.href = "dashboard.html";
    return null;
  }
  return { session: session, role: role };
}

document.addEventListener("DOMContentLoaded", initAuthNav);
