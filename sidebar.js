// Unified sidebar. Each page declares <aside id="appSidebar" data-page="..."></aside>
// and gets only its own menu items. Edit SIDEBAR_MENUS to change what a page shows.
(function () {
    const DASHBOARD = { label: "Dashboard", href: "dashboard.html", icon: "fa-solid fa-table-cells-large" };
    const REGISTRATION = { label: "Registration", href: "registration.html", icon: "fa-solid fa-user-plus" };
    const RECORDS = { label: "Patient Records", href: "registration.html#records", icon: "fa-solid fa-folder-open" };
    const QUEUE = { label: "Patient Queue", href: "queue.html", icon: "fa-solid fa-users" };
    const APPOINTMENTS = { label: "Appointments", href: "appointment.html", icon: "fa-regular fa-calendar" };

    const SIDEBAR_MENUS = {
        dashboard: [DASHBOARD, REGISTRATION, QUEUE, APPOINTMENTS,
            { label: "Services", icon: "fa-solid fa-stethoscope", children: [
                { label: "Laboratory Services", href: "#" }, { label: "Scan", href: "#" }, { label: "Dental services", href: "#" }] },
            { label: "Wards", icon: "fa-solid fa-bed", children: [
                { label: "Children Wards", href: "#" }, { label: "Female Wards", href: "#" }, { label: "Male Wards", href: "#" }] },
            { label: "Settings", href: "setting.html", icon: "fa-solid fa-gear" }],
        registration: [DASHBOARD, { label: "Register Patient", href: "registration.html", icon: "fa-solid fa-user-plus" },
            RECORDS, QUEUE],
        queue: [DASHBOARD, QUEUE, RECORDS, REGISTRATION],
        appointment: [DASHBOARD, APPOINTMENTS, QUEUE],
        "emergency-unidentified": [DASHBOARD, REGISTRATION],
        "emergency-complete": [DASHBOARD, REGISTRATION, { label: "Emergency Record", href: "emergency-complete.html", icon: "fa-solid fa-file-medical" }]
    };

    const sidebar = document.getElementById("appSidebar");
    if (!sidebar) return;
    const items = SIDEBAR_MENUS[sidebar.dataset.page] || [DASHBOARD];

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function link(item) {
        const a = el("a", "app-nav-link");
        a.href = item.href;
        a.dataset.href = item.href;
        if (item.icon) a.appendChild(el("i", item.icon));
        a.appendChild(el("span", "", item.label));
        return a;
    }

    const logo = el("div", "app-logo");
    logo.appendChild(el("i", "fa-solid fa-heart-pulse"));
    const brand = el("div");
    brand.append(el("h2", "", "PHIFET EMR"), el("p", "", "Electronic Medical Record"));
    logo.appendChild(brand);

    const toggle = el("button", "app-sidebar-toggle");
    toggle.type = "button";
    toggle.appendChild(el("i", "fa-solid fa-bars"));

    const nav = el("nav", "app-nav");
    items.forEach(function (item) {
        if (!item.children) return nav.appendChild(link(item));
        const group = el("details", "app-nav-group");
        const summary = el("summary", "app-nav-link");
        summary.append(el("i", item.icon), el("span", "", item.label));
        group.appendChild(summary);
        item.children.forEach(function (child) { group.appendChild(link(child)); });
        nav.appendChild(group);
    });

    // Logout pinned to the bottom of every sidebar.
    const logout = el("button", "app-nav-link app-logout");
    logout.type = "button";
    logout.append(el("i", "fa-solid fa-right-from-bracket"), el("span", "", "Logout"));
    logout.addEventListener("click", function () {
        if (typeof EMR_AUTH !== "undefined") EMR_AUTH.logout();
    });

    sidebar.classList.add("app-sidebar");
    sidebar.append(logo, toggle, nav, logout);
    document.body.classList.add("has-app-sidebar");

    // Active item: exact page + hash match wins; otherwise the page's hash-less link.
    function markActive() {
        const page = location.pathname.split("/").pop() || "index.html";
        const current = page + location.hash;
        const links = nav.querySelectorAll("a.app-nav-link");
        let match = Array.prototype.find.call(links, function (a) { return a.dataset.href === current; }) ||
            Array.prototype.find.call(links, function (a) { return a.dataset.href === page; });
        links.forEach(function (a) {
            a.classList.toggle("active", a === match);
            if (a === match) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
    }
    markActive();
    window.addEventListener("hashchange", markActive);

    // Collapse state is a per-viewer convenience only.
    function setCollapsed(collapsed) {
        document.body.classList.toggle("app-sidebar-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
        try { localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0"); } catch (e) { /* ignore */ }
    }
    let saved = false;
    try { saved = localStorage.getItem("sidebarCollapsed") === "1"; } catch (e) { /* ignore */ }
    setCollapsed(saved);
    toggle.addEventListener("click", function () {
        setCollapsed(!document.body.classList.contains("app-sidebar-collapsed"));
    });
})();
