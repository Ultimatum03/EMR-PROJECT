// Light/dark theme. Load in <head> so the saved theme applies before the page paints.
const EMR_THEME = (function () {
    const KEY = "emrTheme";

    function saved() {
        try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
    }

    function apply(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    function set(theme) {
        apply(theme);
        try { localStorage.setItem(KEY, theme); } catch (e) { /* per-viewer convenience only */ }
        document.dispatchEvent(new CustomEvent("emr-theme-change", { detail: theme }));
    }

    apply(saved());
    window.addEventListener("storage", function (event) { if (event.key === KEY) apply(saved()); });

    return {
        current: function () { return document.documentElement.getAttribute("data-theme") || "light"; },
        toggle: function () { set(this.current() === "dark" ? "light" : "dark"); }
    };
})();
