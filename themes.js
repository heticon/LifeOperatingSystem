// Life OS themes and layout (Minimal design system — see DESIGN.md).
// bg – page surface, side – sidebar/tab bar, card – sheets/inputs/cells, hover – hover/selected,
// line – hairlines, fg – text, muted – secondary text (≥ 4.5:1), faint – non-text only,
// accent – primary (filled buttons, checked boxes, active bar), onAccent – text on accent,
// accent2 – secondary (Today, links, focus ring), danger – overdue/delete.
// Loaded first so the theme applies before the page paints.
window.LIFEOS_THEMES = {
  paper: {
    name: "Paper", dark: false,
    bg: "#F4F4F1", side: "#EFEFEB", card: "#FFFFFF", hover: "#E9E9E4", line: "#DCDCD6",
    fg: "#0C0C09", muted: "#5F5F59", faint: "#A8A8A2", accent: "#0C0C09", onAccent: "#F4F4F1",
    accent2: "#312C85", danger: "#B91C1C"
  },
  ink: {
    name: "Ink", dark: true,
    bg: "#0C0C09", side: "#10100D", card: "#171714", hover: "#1F1F1B", line: "#2B2B26",
    fg: "#F4F4F1", muted: "#A3A39C", faint: "#55554F", accent: "#F4F4F1", onAccent: "#0C0C09",
    accent2: "#A29CF6", danger: "#F87171"
  },
  stone: {
    name: "Stone", dark: false,
    bg: "#F3F4F5", side: "#EEEFF1", card: "#FFFFFF", hover: "#E7E9EC", line: "#D9DCE0",
    fg: "#0E1013", muted: "#5B6068", faint: "#A7ABB2", accent: "#0E1013", onAccent: "#FFFFFF",
    accent2: "#312C85", danger: "#B91C1C"
  },
  indigo: {
    name: "Indigo", dark: false,
    bg: "#F4F4F1", side: "#EFEFEB", card: "#FFFFFF", hover: "#E9E9E4", line: "#DCDCD6",
    fg: "#0C0C09", muted: "#5F5F59", faint: "#A8A8A2", accent: "#312C85", onAccent: "#FFFFFF",
    accent2: "#312C85", danger: "#B91C1C"
  },
  graphite: {
    name: "Graphite", dark: true,
    bg: "#1A1A18", side: "#1E1E1C", card: "#232321", hover: "#2B2B28", line: "#353531",
    fg: "#EDEDE8", muted: "#A6A69F", faint: "#5E5E58", accent: "#EDEDE8", onAccent: "#1A1A18",
    accent2: "#A9A3F8", danger: "#F87171"
  },
  sand: {
    name: "Sand", dark: false,
    bg: "#F5F1EA", side: "#EFEAE1", card: "#FFFDF9", hover: "#E8E1D5", line: "#DDD5C7",
    fg: "#1C1915", muted: "#655C50", faint: "#B0A696", accent: "#1C1915", onAccent: "#F5F1EA",
    accent2: "#8A4B14", danger: "#B91C1C"
  },
  mist: {
    name: "Mist", dark: false,
    bg: "#F2F5F8", side: "#EBF0F4", card: "#FFFFFF", hover: "#E2E8EE", line: "#D3DCE4",
    fg: "#0F1720", muted: "#526070", faint: "#A3AEB9", accent: "#1D4ED8", onAccent: "#FFFFFF",
    accent2: "#1D4ED8", danger: "#B91C1C"
  },
  rose: {
    name: "Rose", dark: false,
    bg: "#F8F3F3", side: "#F3ECEC", card: "#FFFFFF", hover: "#EEE3E3", line: "#E2D4D4",
    fg: "#1D1416", muted: "#69585B", faint: "#B7A6A9", accent: "#9F1239", onAccent: "#FFFFFF",
    accent2: "#9F1239", danger: "#B91C1C"
  },
  nord: {
    name: "Nord", dark: true,
    bg: "#1E222A", side: "#22262F", card: "#272C36", hover: "#2F3542", line: "#3B4252",
    fg: "#ECEFF4", muted: "#AAB3C3", faint: "#5E6779", accent: "#88C0D0", onAccent: "#1E222A",
    accent2: "#88C0D0", danger: "#F28B82"
  },
  forest: {
    name: "Forest", dark: true,
    bg: "#0F1411", side: "#121915", card: "#18201B", hover: "#1F2923", line: "#2A362E",
    fg: "#EEF3EF", muted: "#A2B0A6", faint: "#56635A", accent: "#6FCF97", onAccent: "#0F1411",
    accent2: "#6FCF97", danger: "#F87171"
  },
  midnight: {
    name: "Midnight", dark: true,
    bg: "#0B1020", side: "#0E1426", card: "#131A30", hover: "#1A2240", line: "#26304F",
    fg: "#EEF1FA", muted: "#A3ABC4", faint: "#4F5875", accent: "#8AB4FF", onAccent: "#0B1020",
    accent2: "#8AB4FF", danger: "#F87171"
  },
  carbon: {
    name: "Carbon", dark: true,
    bg: "#0C0C09", side: "#10100D", card: "#171714", hover: "#1F1F1B", line: "#2B2B26",
    fg: "#F4F4F1", muted: "#A3A39C", faint: "#55554F", accent: "#D5001C", onAccent: "#FFFFFF",
    accent2: "#FF4D5E", danger: "#F87171"
  }
};

window.LIFEOS_TOKENS = ["bg", "side", "card", "hover", "line", "fg", "muted", "faint", "accent", "onAccent", "accent2", "danger"];

window.lifeosResolveTheme = function (choice) {
  if (window.LIFEOS_THEMES[choice]) return choice;
  var sysDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return sysDark ? "ink" : "paper"; // Auto follows the system
};

window.lifeosApplyTheme = function (choice) {
  var key = window.lifeosResolveTheme(choice);
  var t = window.LIFEOS_THEMES[key], st = document.documentElement.style;
  window.LIFEOS_TOKENS.forEach(function (k) {
    st.setProperty("--" + k.replace(/([A-Z0-9])/g, function (c) { return "-" + c.toLowerCase(); }), t[k]);
  });
  st.setProperty("color-scheme", t.dark ? "dark" : "light");
  document.documentElement.dataset.mode = t.dark ? "dark" : "light";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.bg);
};

// Layout: "apple" = Simple (tab bar, large titles, sheets) or "obsidian" (sidebar tree, breadcrumbs, side panel)
// Text size: whole interface a bit smaller or bigger (s / m / l)
window.lifeosApplySize = function (choice) {
  document.documentElement.style.zoom = choice === "s" ? "0.92" : choice === "l" ? "1.1" : "";
  document.documentElement.dataset.size = choice || "m";
};

window.lifeosApplyLayout = function (choice) {
  document.documentElement.dataset.layout = choice === "obsidian" ? "obsidian" : "apple";
};

(function () {
  var theme = "auto", layout = "apple";
  try {
    theme = localStorage.getItem("lifeos.theme") || "auto";
    layout = localStorage.getItem("lifeos.layout") || "apple";
  } catch (e) {}
  window.lifeosApplyTheme(theme);
  window.lifeosApplyLayout(layout);
  try { window.lifeosApplySize(localStorage.getItem("lifeos.size") || "m"); } catch (e) {}
})();
