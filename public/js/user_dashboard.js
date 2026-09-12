(function () {
  "use strict";

  const toastHost = document.createElement("div");
  toastHost.setAttribute("aria-live", "polite");
  Object.assign(toastHost.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "999",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });
  document.body.appendChild(toastHost);

  function toast(message) {
    const el = document.createElement("div");
    el.textContent = message;
    Object.assign(el.style, {
      background: "#0e0e10",
      color: "#fff",
      fontFamily: "'Chakra Petch', sans-serif",
      fontWeight: "600",
      fontSize: "0.82rem",
      padding: "12px 18px",
      borderRadius: "40px",
      boxShadow: "0 14px 34px rgba(0,0,0,.25)",
      opacity: "0",
      transform: "translateY(8px)",
      transition: "opacity .25s ease, transform .25s ease",
    });
    toastHost.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  // expose toast globally so user-dashboard-data.js can use it too
  window.libToast = toast;

  const menuToggle = document.getElementById("dashboardMenuToggle");
  const menuClose = document.getElementById("dashboardMenuClose");
  const menuOverlay = document.getElementById("dashboardMenuOverlay");
  const dashboardNav = document.getElementById("dashboardNavigation");

  function setDashboardMenu(open) {
    document.body.classList.toggle("dashboard-menu-open", open);
    menuToggle?.setAttribute("aria-expanded", String(open));
    menuToggle?.setAttribute("aria-label", open ? "Close dashboard menu" : "Open dashboard menu");
    const icon = menuToggle?.querySelector("i");
    icon?.classList.toggle("fa-bars", !open);
    icon?.classList.toggle("fa-xmark", open);
  }

  menuToggle?.addEventListener("click", () => setDashboardMenu(!document.body.classList.contains("dashboard-menu-open")));
  menuClose?.addEventListener("click", () => setDashboardMenu(false));
  menuOverlay?.addEventListener("click", () => setDashboardMenu(false));
  dashboardNav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setDashboardMenu(false);
  });

  document.getElementById('dashboardLogout')?.addEventListener('click', async event => {
    event.preventDefault();
    try {
      const response = await fetch('/api/auth/logout', {method:'POST'});
      if (!response.ok) throw new Error();
      localStorage.removeItem('token');
      location.href = '/';
    } catch { toast('Unable to sign out. Please try again.'); }
  });

  /* account settings form */
  const accountForm = document.querySelector(".account__fields");
  if (accountForm) {
    const changePwBtn = accountForm.querySelector(".btn--ghost");
    // This button uses email reset, which is temporarily unavailable.
    if (changePwBtn) { changePwBtn.hidden = true; changePwBtn.style.display = 'none'; }
  }

  /* nav scrollspy */
  const navLinks = Array.from(document.querySelectorAll(".menu a"));
  const sections = navLinks
    .map((link) => {
      const id = link.getAttribute("href");
      return id && id.startsWith("#") && id.length > 1
        ? document.querySelector(id)
        : null;
    })
    .filter(Boolean);

  function updateActiveLink() {
    let currentId = null;
    const scrollPos = window.scrollY + 120;
    sections.forEach((section) => {
      if (section.offsetTop <= scrollPos) currentId = "#" + section.id;
    });
    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      link.classList.toggle("is-active", href === currentId || (!currentId && href === "#"));
    });
  }

  window.addEventListener("scroll", updateActiveLink, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("dashboard-menu-open")) {
      setDashboardMenu(false);
      menuToggle?.focus();
    }
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", (event) => {
    if (event.matches) setDashboardMenu(false);
  });
})();
