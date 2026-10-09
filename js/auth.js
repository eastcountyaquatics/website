// Shared auth-state UI: populates the nav "account" slot on every page
// and (optionally) guards pages that require a signed-in user or a staff role.

async function getUserRole(userId, client) {
  const { data } = await (client || supabaseClient)
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
    // Staff get the admin panel AND My Account -- coaches and managers are
    // often parents too, and My Account is where they add their own kids.
    const middleLink = role
      ? '<a href="admin.html" class="nav-btn nav-btn-admin">Admin</a><a href="dashboard.html" class="nav-btn">My Account</a>'
      : '<a href="dashboard.html" class="nav-btn">My Account</a>';
    slot.innerHTML = middleLink + '<a href="#" id="nav-sign-out">Sign Out</a>';
    const signOutLink = document.getElementById("nav-sign-out");
    signOutLink.addEventListener("click", async function (e) {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  } else {
    slot.innerHTML = '<a href="login.html" class="nav-btn">Sign In</a>';
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
    // Come back to this exact page (and #section) after signing in.
    const here = (window.location.pathname.split("/").pop() || "dashboard.html") + window.location.search + window.location.hash;
    window.location.href = "login.html?next=" + encodeURIComponent(here);
    return null;
  }
  return session;
}

// The page login.html should go to afterwards: only a page on this site
// (e.g. "dashboard.html#free-trial"), never an outside address.
function safeNextPage() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return /^[a-z0-9-]+\.html(\?[a-z0-9=&%._-]*)?(#[a-z0-9-]+)?$/i.test(next) ? next : null;
}

// Call on admin pages. Redirects to login.html if signed out, or to
// dashboard.html if signed in but not a staff account.
// Pass e.g. ["owner"] to further restrict a page to just owners.
async function requireRole(allowedRoles) {
  const session = await requireAuth();
  if (!session) return null;

  const role = await getUserRole(session.user.id);
  const roles = allowedRoles || ["owner", "coach"];
  if (!role || roles.indexOf(role) === -1) {
    window.location.href = "dashboard.html";
    return null;
  }
  return { session: session, role: role };
}

document.addEventListener("DOMContentLoaded", initAuthNav);
