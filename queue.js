// Live patient queue per clinic. "Live" = updates instantly across tabs in this browser
// (storage event) plus a 30s refresh. Multi-computer updates need the backend.
(function () {
    const PAGE_SIZE = 10;
    const tabs = document.getElementById("clinicTabs");
    const body = document.getElementById("queueBody");
    const errorBox = document.getElementById("queueError");
    const pager = document.getElementById("queuePager");

    // Visual identity per clinic (icon + colour tone). Unknown clinics fall back to "blue".
    const CLINIC_LOOK = {
        gopd: { icon: "fa-solid fa-users", tone: "blue" },
        paed: { icon: "fa-solid fa-children", tone: "purple" },
        anc: { icon: "fa-solid fa-person-pregnant", tone: "green" },
        dental: { icon: "fa-solid fa-tooth", tone: "amber" },
        eye: { icon: "fa-solid fa-eye", tone: "sky" },
        emergency: { icon: "fa-solid fa-square-plus", tone: "red" }
    };
    const STATUS_ORDER = { "in-consultation": 0, "checked-in": 1, "scheduled": 2, "done": 3 };
    const STATUS_TEXT = { "scheduled": "Scheduled", "checked-in": "Waiting", "in-consultation": "With Doctor", "done": "Done" };
    const ACTION_LABELS = { "checked-in": "Check in", "in-consultation": "Start consultation", "done": "Complete" };
    const TYPE_LOOK = {
        "appointment": { label: "Appointment", icon: "fa-regular fa-calendar" },
        "walk-in": { label: "Walk-in", icon: "fa-solid fa-person-walking" },
        "emergency": { label: "Emergency", icon: "fa-solid fa-truck-medical" }
    };

    // Filters apply when "Filter" is pressed (or Enter in search); live refreshes keep them.
    let applied = { q: "", status: "", type: "", time: "today" };
    let page = 1;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }
    function icon(cls) { const i = el("i", cls); i.setAttribute("aria-hidden", "true"); return i; }
    function look(id) { return CLINIC_LOOK[id] || { icon: "fa-solid fa-hospital", tone: "blue" }; }

    function selectedClinicId() {
        const match = /^#clinic=([\w-]+)$/.exec(location.hash);
        return match && EMR.clinic(match[1]) ? match[1] : EMR.CLINICS[0].id;
    }

    function renderTabs(current, visits) {
        const today = EMR.today();
        tabs.replaceChildren();
        EMR.CLINICS.forEach(function (c) {
            const load = visits.filter(function (v) {
                return v.clinicId === c.id && v.date === today && v.status !== "cancelled";
            }).length;
            const btn = el("button", "clinic-card tone-" + look(c.id).tone + (c.id === current ? " active" : ""));
            btn.type = "button";
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", String(c.id === current));
            const iconWrap = el("span", "clinic-card-icon");
            iconWrap.appendChild(icon(look(c.id).icon));
            const text = el("span", "clinic-card-text");
            const count = el("span", "clinic-card-count");
            count.append(el("strong", "", String(load)), document.createTextNode(c.capacity === null ? "" : " / " + c.capacity));
            text.append(el("span", "clinic-card-name", c.name), count);
            btn.append(iconWrap, text, icon("fa-solid fa-chevron-right clinic-card-chevron"));
            btn.addEventListener("click", function () {
                page = 1;
                location.hash = "clinic=" + c.id;
            });
            tabs.appendChild(btn);
        });
    }

    function matchesTime(time, range) {
        if (range === "morning") return time < "12:00";
        if (range === "afternoon") return time >= "12:00" && time < "17:00";
        if (range === "evening") return time >= "17:00";
        return true;
    }

    function matchesSearch(v, p, q) {
        if (!q) return true;
        const hay = [v.patientId, p && p.firstName, p && p.lastName, p && (p.firstName + " " + p.lastName), p && p.phone]
            .filter(Boolean).join(" ").toLowerCase();
        return hay.indexOf(q) !== -1;
    }

    // ⋮ menu with the next status steps for this visit.
    let openMenu = null;
    function closeMenu() {
        if (!openMenu) return;
        openMenu.menu.classList.add("hidden");
        openMenu.button.setAttribute("aria-expanded", "false");
        openMenu = null;
    }
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        closeMenu();
        closeDetail();
    });

    function kebab(v) {
        const wrap = el("div", "kebab");
        const btn = el("button", "kebab-btn");
        btn.type = "button";
        btn.setAttribute("aria-label", "More actions");
        btn.setAttribute("aria-haspopup", "menu");
        btn.setAttribute("aria-expanded", "false");
        btn.appendChild(icon("fa-solid fa-ellipsis-vertical"));
        const menu = el("div", "kebab-menu hidden");
        menu.setAttribute("role", "menu");
        const steps = (EMR.NEXT_STATUS[v.status] || []).filter(function (s) { return ACTION_LABELS[s]; });
        if (!steps.length) {
            const none = el("span", "kebab-empty", "No further actions");
            menu.appendChild(none);
        }
        steps.forEach(function (next) {
            const item = el("button", "kebab-item", ACTION_LABELS[next]);
            item.type = "button";
            item.setAttribute("role", "menuitem");
            item.addEventListener("click", function (event) {
                event.stopPropagation();
                closeMenu();
                let error;
                try { error = EMR.setVisitStatus(v.id, next); } catch (err) { error = "Could not save the change."; }
                errorBox.textContent = error || "";
                render();
            });
            menu.appendChild(item);
        });
        btn.addEventListener("click", function (event) {
            event.stopPropagation();
            const wasOpen = openMenu && openMenu.menu === menu;
            closeMenu();
            if (wasOpen) return;
            menu.classList.remove("hidden");
            btn.setAttribute("aria-expanded", "true");
            openMenu = { menu: menu, button: btn };
        });
        wrap.append(btn, menu);
        return wrap;
    }

    // View → read-only patient details
    const detail = document.getElementById("queueDetail");
    function openDetail(p) {
        if (!p) return;
        document.getElementById("queueDetailSub").textContent = p.firstName + " " + p.lastName + " · " + p.id;
        EMR.renderDetailGroups(p, document.getElementById("queueDetailBody"));
        detail.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }
    function closeDetail() {
        detail.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }
    document.getElementById("queueDetailClose").addEventListener("click", closeDetail);
    detail.addEventListener("click", function (event) { if (event.target === detail) closeDetail(); });

    function renderPager(totalPages) {
        pager.replaceChildren();
        function pageBtn(label, target, opts) {
            const b = el("button", "pager-btn" + (opts.active ? " active" : ""));
            b.type = "button";
            b.disabled = !!opts.disabled;
            if (opts.aria) b.setAttribute("aria-label", opts.aria);
            if (opts.active) b.setAttribute("aria-current", "page");
            if (opts.icon) b.appendChild(icon(opts.icon)); else b.textContent = label;
            b.addEventListener("click", function () { page = target; render(); });
            return b;
        }
        pager.appendChild(pageBtn("", page - 1, { disabled: page <= 1, icon: "fa-solid fa-chevron-left", aria: "Previous page" }));
        const first = Math.max(1, Math.min(page - 2, totalPages - 4));
        for (let n = first; n <= Math.min(totalPages, first + 4); n++) {
            pager.appendChild(pageBtn(String(n), n, { active: n === page }));
        }
        pager.appendChild(pageBtn("", page + 1, { disabled: page >= totalPages, icon: "fa-solid fa-chevron-right", aria: "Next page" }));
    }

    function render() {
        const clinicId = selectedClinicId();
        const clinic = EMR.clinic(clinicId);
        let visits, patients;
        try {
            visits = EMR.getVisits();
            patients = EMR.getPatients();
        } catch (err) {
            errorBox.textContent = "Could not read queue data.";
            body.replaceChildren();
            return;
        }
        renderTabs(clinicId, visits);

        const byId = {};
        patients.forEach(function (p) { byId[p.id] = p; });
        const today = EMR.today();
        const queue = visits.filter(function (v) {
            return v.clinicId === clinicId && v.date === today && v.status !== "cancelled";
        }).sort(function (a, b) {
            const s = (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
            if (s) return s;
            const e = (b.source === "emergency") - (a.source === "emergency"); // emergencies first
            return e || a.time.localeCompare(b.time);
        });

        // Header
        document.getElementById("queueTitle").textContent = clinic.name;
        const headIcon = document.getElementById("queueClinicIcon");
        headIcon.className = "queue-clinic-icon tone-" + look(clinicId).tone;
        headIcon.replaceChildren(icon(look(clinicId).icon));
        const count = function (status) { return queue.filter(function (v) { return v.status === status; }).length; };
        const summary = document.getElementById("queueSummary");
        summary.replaceChildren();
        [["Waiting", count("checked-in")], ["With doctor", count("in-consultation")], ["Not arrived", count("scheduled")],
            ["Done", count("done")], ["Load", queue.length + (clinic.capacity === null ? "" : " / " + clinic.capacity)]]
            .forEach(function (pair, i) {
                if (i) summary.appendChild(el("span", "summary-sep", "|"));
                summary.appendChild(el("span", "", pair[0] + ": " + pair[1]));
            });

        // Filters
        const q = applied.q.toLowerCase();
        const rows = queue.filter(function (v) {
            return (!applied.status || v.status === applied.status) &&
                (!applied.type || v.source === applied.type) &&
                matchesTime(v.time, applied.time) &&
                matchesSearch(v, byId[v.patientId], q);
        });

        const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        if (page > totalPages) page = totalPages;
        const start = (page - 1) * PAGE_SIZE;
        const pageRows = rows.slice(start, start + PAGE_SIZE);

        body.replaceChildren();
        if (!pageRows.length) {
            const td = el("td", "empty-state");
            td.colSpan = 8;
            td.append(icon("fa-solid fa-users-slash empty-state-icon"),
                el("strong", "", queue.length ? "No patients match these filters" : "No patients in this clinic's queue today"));
            const tr = el("tr");
            tr.appendChild(td);
            body.appendChild(tr);
        }

        pageRows.forEach(function (v, i) {
            const p = byId[v.patientId];
            const tr = el("tr");
            const emergency = v.source === "emergency" || (p && p.patientType === "Emergency");
            if (emergency) tr.classList.add("emergency-row");

            tr.appendChild(el("td", "q-index", String(start + i + 1)));
            tr.appendChild(el("td", "q-time", v.time));

            const patientTd = el("td");
            const who = el("div", "q-patient");
            const text = el("div", "q-patient-text");
            const nameLine = el("div", "q-name");
            nameLine.appendChild(el("span", "", p ? p.firstName + " " + p.lastName : "Unknown patient"));
            if (emergency) {
                const flag = el("span", "q-flag");
                flag.title = "Emergency case";
                flag.setAttribute("aria-label", "Emergency case");
                flag.appendChild(icon("fa-solid fa-flag"));
                nameLine.appendChild(flag);
            }
            const meta = p ? [p.gender, EMR.ageAndDob(p.dateOfBirth)].filter(Boolean).join(" • ") : "";
            text.append(nameLine, el("div", "q-meta", meta));
            who.append(EMR.photoElement(p, "q-avatar"), text);
            patientTd.appendChild(who);
            tr.appendChild(patientTd);

            tr.appendChild(el("td", "q-pid", v.patientId));

            const typeTd = el("td");
            const t = TYPE_LOOK[v.source] || { label: v.source, icon: "fa-solid fa-circle" };
            const typeBadge = el("span", "q-type type-" + v.source);
            typeBadge.append(icon(t.icon), document.createTextNode(" " + t.label));
            typeTd.appendChild(typeBadge);
            tr.appendChild(typeTd);

            const visitTd = el("td");
            const isNew = EMR.isNewToClinic(v, visits);
            visitTd.append(el("div", "q-visit", isNew ? "Initial Consultation" : "Follow-up"), el("div", "q-meta", clinic.name));
            tr.appendChild(visitTd);

            const statusTd = el("td");
            statusTd.appendChild(el("span", "q-status status-" + v.status, STATUS_TEXT[v.status] || v.status));
            tr.appendChild(statusTd);

            const actionTd = el("td");
            const actions = el("div", "q-actions");
            const view = el("button", "view-btn");
            view.type = "button";
            view.append(icon("fa-regular fa-eye"), document.createTextNode(" View"));
            view.addEventListener("click", function () { openDetail(p); });
            actions.append(view, kebab(v));
            actionTd.appendChild(actions);
            tr.appendChild(actionTd);

            body.appendChild(tr);
        });

        document.getElementById("queueCount").textContent =
            "Showing " + pageRows.length + " of " + rows.length + " patient" + (rows.length === 1 ? "" : "s");
        renderPager(totalPages);
    }

    document.getElementById("queueFilters").addEventListener("submit", function (event) {
        event.preventDefault();
        applied = {
            q: document.getElementById("queueSearch").value.trim(),
            status: document.getElementById("statusFilterQ").value,
            type: document.getElementById("typeFilterQ").value,
            time: document.getElementById("timeFilterQ").value
        };
        page = 1;
        render();
    });
    document.getElementById("refreshBtn").addEventListener("click", function () { errorBox.textContent = ""; render(); });

    window.addEventListener("hashchange", function () { page = 1; render(); });
    window.addEventListener("storage", function (event) {
        if (event.key === "visits" || event.key === "patients") render();
    });
    setInterval(render, 30000);
    render();
})();
