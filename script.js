/* ==========================================================================
   Atlas — theme toggle

   What it does:
   - Picks a starting theme: the saved choice if there is one, otherwise the
     operating system preference, otherwise light.
   - Flips the theme when the button is pressed, keeps the button's label and
     aria-pressed state in sync, and remembers the choice in localStorage.
   - Follows later changes to the OS preference, but only until the visitor
     makes an explicit choice of their own.

   If JavaScript is unavailable, the page still reads correctly and simply
   keeps its default appearance. Every storage call is wrapped so a browser
   that blocks localStorage does not cause an error.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "atlas-theme";
  var DARK_QUERY = "(prefers-color-scheme: dark)";

  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  /* Returns "dark", "light", or null when nothing valid is stored. */
  function readSavedTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* Storage unavailable (private mode, blocked cookies): stay quiet. */
    }
  }

  function systemPrefersDark() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia(DARK_QUERY).matches
    );
  }

  /* Single place that touches the DOM, so markup and button stay consistent. */
  function applyTheme(theme) {
    var isDark = theme === "dark";

    root.setAttribute("data-theme", theme);

    if (!toggle) {
      return;
    }

    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.textContent = isDark ? "Light theme" : "Dark theme";
  }

  /* Starting theme: saved choice wins, then the OS, then light. */
  applyTheme(readSavedTheme() || (systemPrefersDark() ? "dark" : "light"));

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next =
        root.getAttribute("data-theme") === "dark" ? "light" : "dark";

      applyTheme(next);
      saveTheme(next);
    });
  }

  /* Track OS changes only while the visitor has not chosen a theme. */
  if (typeof window.matchMedia === "function") {
    var query = window.matchMedia(DARK_QUERY);

    var onSystemChange = function (event) {
      if (!readSavedTheme()) {
        applyTheme(event.matches ? "dark" : "light");
      }
    };

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onSystemChange);
    } else if (typeof query.addListener === "function") {
      query.addListener(onSystemChange); /* Older Safari. */
    }
  }
})();
