// Adds owner-created pages (flagged "show in nav") to the main nav, just
// before the account slot. Fails silently: the hand-built nav links are
// already in the HTML, so a slow or unreachable Supabase never leaves the
// header broken.
(function () {
  async function loadNavPages() {
    try {
      const result = await Promise.race([
        supabaseClient
          .from("pages")
          .select("slug, title, nav_label")
          .eq("is_published", true)
          .eq("show_in_nav", true)
          .order("sort_order", { ascending: true }),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null }); }, 6000);
        }),
      ]);

      const pages = result && result.data;
      if (!pages || pages.length === 0) return;

      const list = document.querySelector(".main-nav ul");
      if (!list) return;
      const authSlot = document.getElementById("nav-auth-slot");

      pages.forEach(function (p) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "page.html?slug=" + encodeURIComponent(p.slug);
        a.textContent = p.nav_label || p.title;
        li.appendChild(a);
        if (authSlot) list.insertBefore(li, authSlot);
        else list.appendChild(li);
      });
    } catch (e) {
      // Static nav stands on its own.
    }
  }

  if (typeof supabaseClient !== "undefined") loadNavPages();
})();
