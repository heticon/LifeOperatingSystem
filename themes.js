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
})();
