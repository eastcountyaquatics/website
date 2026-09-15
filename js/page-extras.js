// Appends any extra content an owner has added via admin-content.html's
// "Add Content to the Bottom of This Page" editor -- a section, image,
// or list the static page didn't originally have. Injected right before
// the footer. If nothing has been saved, or Supabase is slow or
// unreachable, the page renders exactly as it always did.
(function () {
  if (typeof supabaseClient === "undefined") return;
  const pagePath = window.location.pathname.split("/").pop() || "index.html";

  async function apply() {
    try {
      const result = await Promise.race([
        supabaseClient.from("page_extras").select("body_html").eq("page_path", pagePath).maybeSingle(),
        new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: null }); }, 6000);
        }),
      ]);

      const html = result && result.data && result.data.body_html;
      if (!html || !html.trim()) return;

      const section = document.createElement("section");
      section.id = "cms-extra-content";
      const container = document.createElement("div");
      container.className = "container";
      container.innerHTML = typeof sanitizeHtml === "function" ? sanitizeHtml(html) : html;
      section.appendChild(container);

      const footer = document.querySelector(".site-footer");
      if (footer && footer.parentNode) footer.parentNode.insertBefore(section, footer);
      else document.body.appendChild(section);
    } catch (e) {
      // The rest of the page still renders fine without it.
    }
  }

  apply();
})();
