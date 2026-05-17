/* Shared chrome + lucide-style icons + tweaks panel for all Beacon pages.
 * Stateless utilities — pages call DB.mountHeader(), DB.mountTweaks().
 * State (theme/density/accent/role) is persisted to localStorage and
 * applied to <html data-*> attributes.
 */
(function () {
  const STATE_KEY = "beacon.state.v1";
  const DEFAULTS = { theme: "light", density: "comfortable", accent: "blue", role: "mid" };

  const ROLES = {
    junior: { name: "Maya Chen",  title: "Junior RM",      scope: "80 clients · direct ownership", initials: "MC", colorVar: "--role-junior" },
    mid:    { name: "Adrian Lim", title: "Mid-level RM",   scope: "300 clients · direct ownership", initials: "AL", colorVar: "--role-mid" },
    manager:{ name: "Sofia Tan",  title: "Manager",        scope: "595 visible · 215 direct",       initials: "ST", colorVar: "--role-manager" },
  };

  function readState() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STATE_KEY) || "{}") }; }
    catch { return { ...DEFAULTS }; }
  }
  function writeState(s) { localStorage.setItem(STATE_KEY, JSON.stringify(s)); }
  function applyState(s) {
    const root = document.documentElement;
    root.classList.toggle("dark", s.theme === "dark");
    root.dataset.density = s.density;
    root.dataset.accent  = s.accent;
    root.dataset.role    = s.role;
  }

  // --- Lucide-style icon set (only the ones we use) ---
  const ICONS = {
    waves: 'M2 6c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 12c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 18c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2',
    sparkles: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
    sparkle:  'M12 3l1.7 4.5L18 9l-4.3 1.5L12 15l-1.7-4.5L6 9l4.3-1.5z',
    arrow_right: 'M5 12h14M13 6l6 6-6 6',
    arrow_up_right: 'M7 17L17 7M9 7h8v8',
    chevron_right: 'M9 6l6 6-6 6',
    chevron_down: 'M6 9l6 6 6-6',
    sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
    moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
    log_out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
    settings: 'M12 9a3 3 0 100 6 3 3 0 000-6z M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 118 0v4',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
    phone: 'M22 16.9V21a1 1 0 01-1.1 1A19 19 0 012 4.1 1 1 0 013 3h4.1a1 1 0 011 .8l1 4.4a1 1 0 01-.3 1L7 11a16 16 0 006 6l1.8-1.8a1 1 0 011-.3l4.4 1A1 1 0 0122 16.9z',
    mail: 'M4 6h16v12H4zM4 6l8 7 8-7',
    check: 'M5 12l5 5L20 7',
    check_circle: 'M22 11.1V12a10 10 0 11-5.9-9.1M22 4l-10 10-3-3',
    x: 'M6 6l12 12M18 6L6 18',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
    file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
    calendar: 'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4',
    pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z',
    send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
    play: 'M5 3l14 9-14 9V3z',
    book: 'M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z',
    activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
    trending_up: 'M22 7l-9 9-5-5L2 17M16 7h6v6',
    trending_down: 'M22 17l-9-9-5 5L2 7M16 17h6v-6',
    bar: 'M3 21V10M9 21V3M15 21v-7M21 21v-13',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    info: 'M12 16v-4M12 8h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    refresh: 'M3 2v6h6M21 22v-6h-6M21 12a9 9 0 00-15-6.7L3 8M3 12a9 9 0 0015 6.7L21 16',
    bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
    layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    target: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM18 12a6 6 0 11-12 0 6 6 0 0112 0zM14 12a2 2 0 11-4 0 2 2 0 014 0z',
    history: 'M3 12a9 9 0 109-9 9.7 9.7 0 00-7 3L3 8M3 3v5h5M12 7v5l3 3',
    zap: 'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
    inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13l3.5 7v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z',
    drop: 'M12 2.7s7 6 7 12a7 7 0 11-14 0c0-6 7-12 7-12z',
    globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z',
    coins: 'M12 8a8 4 0 11-8 4M12 8a8 4 0 108 4M4 12v4a8 4 0 008 4M20 12v4a8 4 0 01-8 4M4 8v4',
    arrow_left: 'M19 12H5M12 19l-7-7 7-7',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
  };

  function icon(name, cls = "icon") {
    const d = ICONS[name];
    if (!d) return "";
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  // --- Header ---
  function mountHeader(opts = {}) {
    const s = readState();
    const role = ROLES[s.role];
    const active = opts.active || ""; // "workspace" | "clients" | "manager"
    const navItem = (key, label) => {
      const isActive = active === key;
      const isLocked = key === "manager" && s.role !== "manager";
      const href = opts.links?.[key] || "#";
      return `<a href="${href}" class="db-nav-item ${isActive ? "is-active" : ""} ${isLocked ? "is-locked" : ""}">
        ${label}${isLocked ? icon("lock", "icon-sm") : ""}
      </a>`;
    };

    const html = `
    <header class="db-header">
      <div class="db-header-inner">
        <a href="${opts.links?.home || "index.html"}" class="db-brand">
          <div class="db-brand-mark">${icon("waves", "icon-lg")}</div>
          <div class="db-brand-text">
            <div class="db-brand-title">Dyna Beacon</div>
            <div class="db-brand-sub">Unified RM Copilot</div>
          </div>
        </a>
        <nav class="db-nav">
          ${navItem("workspace", "Workspace")}
          ${navItem("clients",   "Client Book")}
          ${navItem("manager",   "Management")}
        </nav>
        <div class="db-header-right">
          <div class="db-account">
            <span class="db-account-dot" style="background: hsl(var(${role.colorVar}))"></span>
            <div class="db-account-text">
              <div class="db-account-name">${role.name}</div>
              <div class="db-account-role">${role.title}</div>
            </div>
            <span class="db-role-badge" style="
              background: hsl(var(${role.colorVar}) / 0.14);
              color: hsl(var(${role.colorVar}));
              border-color: hsl(var(${role.colorVar}) / 0.3);
            ">${role.title.split(" ")[0]}</span>
          </div>
          <button class="db-icon-btn" data-action="logout" aria-label="Sign out">${icon("log_out")}</button>
          <button class="db-icon-btn" data-action="theme" aria-label="Toggle theme">
            ${s.theme === "dark" ? icon("sun") : icon("moon")}
          </button>
        </div>
      </div>
    </header>`;
    const host = document.querySelector("[data-db-header]") || document.body;
    if (host === document.body) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      document.body.prepend(wrap.firstElementChild);
    } else {
      host.outerHTML = html;
    }
    document.querySelector('[data-action="theme"]').addEventListener("click", () => {
      const ns = readState();
      ns.theme = ns.theme === "dark" ? "light" : "dark";
      writeState(ns); applyState(ns);
      // re-render the icon
      const btn = document.querySelector('[data-action="theme"]');
      btn.innerHTML = ns.theme === "dark" ? icon("sun") : icon("moon");
    });
  }

  // --- Tweaks panel (host integration) ---
  function mountTweaks() {
    const html = `
    <div class="db-tweaks" data-tweaks hidden>
      <div class="db-tweaks-head">
        <div class="db-tweaks-title">${icon("settings", "icon-sm")} Tweaks</div>
        <button class="db-icon-btn" data-tweaks-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="db-tweaks-body">
        <div class="db-tweaks-section">
          <div class="db-tweaks-label">Theme</div>
          <div class="db-tweaks-segments" data-key="theme">
            <button data-val="light">Light</button>
            <button data-val="dark">Dark</button>
          </div>
        </div>
        <div class="db-tweaks-section">
          <div class="db-tweaks-label">Density</div>
          <div class="db-tweaks-segments" data-key="density">
            <button data-val="compact">Compact</button>
            <button data-val="comfortable">Comfort</button>
            <button data-val="spacious">Spacious</button>
          </div>
        </div>
        <div class="db-tweaks-section">
          <div class="db-tweaks-label">Accent</div>
          <div class="db-tweaks-segments" data-key="accent">
            <button data-val="blue">Blue</button>
            <button data-val="champagne">Champagne</button>
            <button data-val="mixed">Mixed</button>
          </div>
        </div>
        <div class="db-tweaks-section">
          <div class="db-tweaks-label">Role</div>
          <div class="db-tweaks-segments" data-key="role">
            <button data-val="junior">Junior</button>
            <button data-val="mid">Mid</button>
            <button data-val="manager">Manager</button>
          </div>
        </div>
        <div class="db-tweaks-foot">Reload after role change to refresh content.</div>
      </div>
    </div>`;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    const panel = document.querySelector("[data-tweaks]");
    function refreshSegments() {
      const s = readState();
      panel.querySelectorAll(".db-tweaks-segments").forEach(grp => {
        const key = grp.dataset.key;
        grp.querySelectorAll("button").forEach(b => {
          b.classList.toggle("is-active", b.dataset.val === s[key]);
        });
      });
    }
    panel.addEventListener("click", e => {
      const btn = e.target.closest(".db-tweaks-segments button");
      if (!btn) return;
      const key = btn.parentElement.dataset.key;
      const ns = readState(); ns[key] = btn.dataset.val;
      writeState(ns); applyState(ns); refreshSegments();
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [key]: btn.dataset.val } }, "*");
    });
    panel.querySelector("[data-tweaks-close]").addEventListener("click", () => {
      panel.hidden = true;
      window.parent.postMessage({ type: "__edit_mode_dismissed" }, "*");
    });

    // protocol — register listener BEFORE announcing availability
    window.addEventListener("message", e => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "__activate_edit_mode")   { panel.hidden = false; refreshSegments(); }
      if (e.data.type === "__deactivate_edit_mode") { panel.hidden = true; }
    });
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");

    refreshSegments();
  }

  // Boot — apply state ASAP to avoid flicker
  applyState(readState());

  window.DB = {
    state: readState,
    setState(patch) { const ns = { ...readState(), ...patch }; writeState(ns); applyState(ns); },
    icon,
    ROLES,
    mountHeader,
    mountTweaks,
  };
})();
