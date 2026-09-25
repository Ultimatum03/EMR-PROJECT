// Shared top bar: <header id="appTopbar"> ... </header>. Anything already inside the header
// (e.g. page action buttons) is kept on the left of the right-hand cluster.
(function () {
    const header = document.getElementById("appTopbar");
    if (!header || typeof EMR_AUTH === "undefined") return;
    const session = EMR_AUTH.getSession();
    if (!session) return;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function icon(cls) { const i = el("i", cls); i.setAttribute("aria-hidden", "true"); return i; }
    function iconButton(cls, label, iconCls) {
        const b = el("button", cls);
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.title = label;
        b.appendChild(icon(iconCls));
        return b;
    }

    header.classList.add("app-topbar");
    const cluster = el("div", "topbar-cluster");

    // Theme toggle
    const themeBtn = iconButton("topbar-icon-btn", "Toggle dark mode", "fa-solid fa-moon");
    function syncThemeIcon() {
        const dark = EMR_THEME.current() === "dark";
        themeBtn.firstChild.className = dark ? "fa-solid fa-sun" : "fa-solid fa-moon";
        themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
        themeBtn.title = themeBtn.getAttribute("aria-label");
        themeBtn.setAttribute("aria-pressed", String(dark));
    }
    themeBtn.addEventListener("click", function () { EMR_THEME.toggle(); });
    document.addEventListener("emr-theme-change", syncThemeIcon);
    syncThemeIcon();

    // Notifications (no notification data yet — no unread dot is shown)
    const bell = iconButton("topbar-icon-btn", "Notifications", "fa-regular fa-bell");

    // User menu
    const userWrap = el("div", "topbar-user");
    const userBtn = el("button", "topbar-user-btn");
    userBtn.type = "button";
    userBtn.setAttribute("aria-haspopup", "menu");
    userBtn.setAttribute("aria-expanded", "false");
    const initials = session.name.split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
    const who = el("span", "topbar-user-text");
    who.append(el("strong", "", session.name), el("small", "", session.role));
    userBtn.append(el("span", "topbar-avatar", initials), who, icon("fa-solid fa-chevron-down topbar-chevron"));
    const menu = el("div", "topbar-menu hidden");
    menu.setAttribute("role", "menu");
    const changeItem = el("button", "topbar-menu-item");
    changeItem.type = "button";
    changeItem.setAttribute("role", "menuitem");
    changeItem.append(icon("fa-solid fa-key"), document.createTextNode(" Change password"));
    const logoutItem = el("button", "topbar-menu-item");
    logoutItem.type = "button";
    logoutItem.setAttribute("role", "menuitem");
    logoutItem.append(icon("fa-solid fa-right-from-bracket"), document.createTextNode(" Logout"));
    menu.append(changeItem, logoutItem);
    userWrap.append(userBtn, menu);

    function setMenu(open) {
        menu.classList.toggle("hidden", !open);
        userBtn.setAttribute("aria-expanded", String(open));
    }
    userBtn.addEventListener("click", function (event) { event.stopPropagation(); setMenu(menu.classList.contains("hidden")); });
    document.addEventListener("click", function (event) { if (!userWrap.contains(event.target)) setMenu(false); });
    changeItem.addEventListener("click", function () { setMenu(false); openPasswordModal(false); });
    logoutItem.addEventListener("click", function () { EMR_AUTH.logout(); });

    // Date / time
    const clock = el("div", "topbar-clock");
    const clockText = el("div", "topbar-clock-text");
    const clockMain = el("strong");
    const clockSub = el("small");
    clockText.append(clockMain, clockSub);
    clock.append(icon("fa-regular fa-calendar"), clockText);
    function tick() {
        const d = new Date();
        const p = function (n) { return String(n).padStart(2, "0"); };
        clockMain.textContent = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
        // Fixed format "Fri, 25 Sep 2026" (locale formatting varies: "Sept", extra commas).
        const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        clockSub.textContent = DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
    }
    tick();
    setInterval(tick, 15000);

    cluster.append(themeBtn, bell, userWrap, el("span", "topbar-divider"), clock);
    header.appendChild(cluster);

    // ---------- Change password modal ----------
    const overlay = el("div", "pw-overlay hidden");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "pwTitle");
    const card = el("form", "pw-card");
    card.noValidate = true;
    const title = el("h2", "", "Change password");
    title.id = "pwTitle";
    const note = el("p", "pw-note");
    function field(id, label, autocomplete) {
        const wrap = el("div", "pw-field");
        const l = el("label", "", label);
        l.htmlFor = id;
        const input = el("input");
        input.type = "password";
        input.id = id;
        input.autocomplete = autocomplete;
        input.maxLength = 128;
        wrap.append(l, input);
        return { wrap: wrap, input: input };
    }
    const current = field("pwCurrent", "Current password", "current-password");
    const next = field("pwNew", "New password", "new-password");
    const confirm = field("pwConfirm", "Confirm new password", "new-password");
    const error = el("p", "pw-error");
    error.setAttribute("role", "alert");
    const actions = el("div", "pw-actions");
    const cancel = el("button", "pw-btn pw-cancel", "Cancel");
    cancel.type = "button";
    const save = el("button", "pw-btn pw-save", "Save password");
    save.type = "submit";
    actions.append(cancel, save);
    card.append(title, note, current.wrap, next.wrap, confirm.wrap, error, actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let forced = false;
    function openPasswordModal(isForced) {
        forced = isForced;
        card.reset();
        error.textContent = "";
        note.textContent = forced
            ? "You're using the temporary password. Set a new one to continue."
            : "At least 8 characters. Not 'password' or your username.";
        cancel.classList.toggle("hidden", forced);
        overlay.classList.remove("hidden");
        document.body.classList.add("modal-open");
        current.input.focus();
    }
    function closePasswordModal() {
        if (forced) return;
        overlay.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }
    cancel.addEventListener("click", closePasswordModal);
    overlay.addEventListener("click", function (event) { if (event.target === overlay) closePasswordModal(); });
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        if (!overlay.classList.contains("hidden")) { event.stopImmediatePropagation(); closePasswordModal(); }
        setMenu(false);
    }, true);
    card.addEventListener("submit", function (event) {
        event.preventDefault();
        save.disabled = true;
        error.textContent = "";
        EMR_AUTH.changePassword(current.input.value, next.input.value, confirm.input.value).then(function (message) {
            save.disabled = false;
            if (message) { error.textContent = message; return; }
            forced = false;
            closePasswordModal();
            alert("Password changed.");
        });
    });

    if (session.mustChange) openPasswordModal(true);
})();
