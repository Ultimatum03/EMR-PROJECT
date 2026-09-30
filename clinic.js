// Clinics: list view (no hash) and clinic landing view (#clinic=<id>).
// DOM is built with textContent only. Ids and class names come from whitelists, never from stored values.
(function () {
    if (!EMR_AUTH.getSession()) return; // requireAccess() is already redirecting; render nothing.

    const root = document.getElementById("clinicRoot");
    const msg = document.getElementById("clinicMsg");
    const modal = document.getElementById("clinicModal");
    const mTitle = document.getElementById("clinicModalTitle");
    const mSub = document.getElementById("clinicModalSub");
    const mBody = document.getElementById("clinicModalBody");
    const TONES = ["blue", "purple", "green", "amber", "sky", "red"];
    const ICONS = { gopd: "fa-stethoscope", paed: "fa-baby", anc: "fa-person-pregnant", dental: "fa-tooth", eye: "fa-eye", emergency: "fa-truck-medical" };
    const TYPES = { "appointment": "Appointment", "walk-in": "Walk-in", "emergency": "Emergency" };

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }
    function icon(cls) { const i = el("i", cls); i.setAttribute("aria-hidden", "true"); return i; }
    function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
    function fullName(p) { return p ? p.firstName + " " + p.lastName : "Unknown patient"; }
    function byTime(a, b) { return String(a.time).localeCompare(String(b.time)); }
    function clinicId() { const m = /^#clinic=([a-z0-9-]{1,30})$/.exec(location.hash); return m ? m[1] : null; }

    // ---------- modal ----------
    function openModal(title, sub, node) {
        mTitle.textContent = title;
        mSub.textContent = sub || "";
        mBody.replaceChildren(node);
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        const first = mBody.querySelector("input, select, textarea, button");
        if (first) first.focus();
    }
    function closeModal() {
        modal.classList.add("hidden");
        document.body.classList.remove("modal-open");
        mBody.replaceChildren();
    }
    document.getElementById("clinicModalClose").addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });

    // submit() returns "" on success or an error message; success closes the modal and refreshes the page.
    function makeForm(content, saveLabel, submit) {
        const form = el("form");
        form.noValidate = true;
        const err = el("p", "nurse-form-error");
        err.setAttribute("role", "alert");
        const cancel = el("button", "nurse-cancel", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", closeModal);
        const save = el("button", "primary-btn", saveLabel);
        save.type = "submit";
        const actions = el("div", "nurse-form-actions");
        actions.append(cancel, save);
        form.append(content, err, actions);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            let m;
            try { m = submit(); } catch (e) { m = "Could not save. Please try again."; }
            err.textContent = m;
            if (!m) { closeModal(); render(); }
        });
        return form;
    }

    function group(labelText, input, id) {
        const g = el("div", "form-group");
        const l = el("label", "", labelText);
        input.id = id;
        l.htmlFor = id;
        g.append(l, input);
        return g;
    }

    // ---------- the four row actions ----------
    function triageForm(v) {
        const grid = el("div", "form-grid");
        const inputs = {};
        NURSE.FIELDS.forEach(function (f) {
            const input = el("input");
            input.type = "text"; input.inputMode = "decimal"; input.autocomplete = "off"; input.maxLength = 6;
            inputs[f.key] = input;
            grid.appendChild(group(f.label + " (" + f.unit + ")", input, "tv-" + f.key));
        });
        const note = el("textarea");
        note.rows = 3; note.maxLength = NURSE.NOTE_MAX;
        const noteGroup = group("Note (optional)", note, "tv-note");
        noteGroup.classList.add("nurse-note-field");
        grid.appendChild(noteGroup);
        return makeForm(grid, "Save vitals", function () {
            const data = { note: note.value };
            NURSE.FIELDS.forEach(function (f) { data[f.key] = inputs[f.key].value; });
            return NURSE.addVitals(v.id, data);
        });
    }

    function openEncounter(v) {
        let m;
        try { m = EMR.setVisitStatus(v.id, "in-consultation"); } catch (e) { m = "Could not open the encounter."; }
        msg.textContent = m;
        render();
    }

    function showRecords(p) {
        let visits;
        try { visits = EMR.getVisits(); } catch (e) { msg.textContent = "Could not read visit history."; return; }
        const wrap = el("div");
        const details = el("div");
        EMR.renderDetailGroups(p, details);
        const list = el("ul", "cl-history");
        visits.filter(function (x) { return x && x.patientId === p.id; })
            .sort(function (a, b) { return (String(b.date) + String(b.time)).localeCompare(String(a.date) + String(a.time)); })
            .forEach(function (x) {
                const c = EMR.clinic(x.clinicId);
                const status = has(EMR.STATUS_LABELS, x.status) ? EMR.STATUS_LABELS[x.status] : "Unknown status";
                list.appendChild(el("li", "", x.date + " " + x.time + " · " + (c ? c.name : "Unknown clinic") + " · " + status));
            });
        if (!list.children.length) list.appendChild(el("li", "", "No visits on record."));
        wrap.append(details, el("h4", "cl-history-title", "Visit history"), list);
        openModal("Existing records", fullName(p) + " · " + p.id, wrap);
    }

    function transferForm(v) {
        const sel = el("select");
        EMR.CLINICS.filter(function (c) { return c.id !== v.clinicId; }).forEach(function (c) {
            const o = el("option", "", c.name);
            o.value = c.id;
            sel.appendChild(o);
        });
        return makeForm(group("Transfer to", sel, "tr-clinic"), "Transfer", function () {
            return CLINIC.transferVisit(v.id, sel.value);
        });
    }

    function doctorForm(clinic) {
        const wrap = el("div");
        const name = el("input"); name.type = "text"; name.maxLength = 80; name.autocomplete = "off";
        const spec = el("input"); spec.type = "text"; spec.maxLength = 60; spec.autocomplete = "off";
        const days = el("div", "cl-days");
        CLINIC.DAY_NAMES.forEach(function (n, i) {
            const lab = el("label", "cl-day");
            const cb = el("input");
            cb.type = "checkbox"; cb.value = String(i);
            lab.append(cb, document.createTextNode(" " + n));
            days.appendChild(lab);
        });
        const dayGroup = el("div", "form-group");
        dayGroup.append(el("label", "", "Working days"), days);
        wrap.append(group("Name", name, "dr-name"), group("Specialty (optional)", spec, "dr-spec"), dayGroup);
        return makeForm(wrap, "Add doctor", function () {
            const picked = Array.prototype.filter.call(days.querySelectorAll("input"), function (c) { return c.checked; })
                .map(function (c) { return Number(c.value); });
            return CLINIC.addDoctor({ name: name.value, specialty: spec.value, clinicId: clinic.id, days: picked });
        });
    }

    // ---------- row actions dropdown ----------
    // The menu lives on <body> with fixed positioning so the table's horizontal scroll never clips it.
    let tab = "waiting";      // which table is showing
    let search = "";          // patient search text, kept across re-renders
    let docsOpen = false;     // floating doctors panel open/closed, kept across re-renders
    let menuEl = null;
    let menuOwner = null;

    function closeMenu() {
        if (menuEl) menuEl.remove();
        menuEl = null;
        menuOwner = null;
    }
    document.addEventListener("click", function (event) {
        if (menuEl && !menuEl.contains(event.target) && !event.target.closest(".cl-more")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        closeMenu();
        if (docsOpen && modal.classList.contains("hidden")) setDocs(false, true);
    });
    // Click anywhere outside the floating panel (and outside the modal it can open) closes it.
    document.addEventListener("click", function (event) {
        if (docsOpen && !event.target.closest(".cl-panel, .cl-fab, .cl-modal, .cl-menu")) setDocs(false);
    });
    function setDocs(open, refocus) {
        docsOpen = open;
        const panel = document.getElementById("clDoctorsPanel");
        const fab = document.getElementById("clDoctorsFab");
        if (panel) panel.classList.toggle("hidden", !open);
        if (fab) {
            fab.setAttribute("aria-expanded", open ? "true" : "false");
            fab.classList.toggle("is-open", open);
            if (refocus) fab.focus();
        }
    }
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    function menuItems(v, p) {
        const waiting = v.status === "checked-in";
        return [
            { label: "Open encounter", icon: "fa-solid fa-play", ok: waiting, why: "patient is not waiting", run: function () { openEncounter(v); } },
            { label: "Transfer", icon: "fa-solid fa-right-left", ok: v.status === "scheduled" || waiting, why: "only scheduled or waiting patients",
              run: function () { openModal("Transfer patient", fullName(p) + " · " + v.patientId, transferForm(v)); } },
            { label: "Triage", icon: "fa-solid fa-briefcase-medical", ok: waiting, why: "patient is not waiting",
              run: function () { openModal("Triage: record vitals", fullName(p) + " · " + v.patientId, triageForm(v)); } },
            { label: "View existing records", icon: "fa-solid fa-file-lines", ok: !!p, why: "patient record not found", run: function () { showRecords(p); } }
        ];
    }

    function openMenu(btn, items) {
        const m = el("div", "cl-menu");
        m.setAttribute("role", "menu");
        items.forEach(function (it, i) {
            const b = el("button", "cl-menu-item" + (i === 0 ? " is-primary" : ""));
            b.type = "button";
            b.setAttribute("role", "menuitem");
            b.disabled = !it.ok;
            if (!it.ok) b.title = it.label + " (unavailable: " + it.why + ")";
            b.append(icon(it.icon), el("span", "", it.label));
            if (it.ok) b.addEventListener("click", function () { closeMenu(); msg.textContent = ""; it.run(); });
            m.appendChild(b);
        });
        document.body.appendChild(m);
        const r = btn.getBoundingClientRect();
        const h = m.offsetHeight, w = m.offsetWidth;
        const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
        m.style.top = top + "px";
        m.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
        menuEl = m;
        menuOwner = btn;
        const first = m.querySelector("button:not(:disabled)");
        if (first) first.focus();
    }

    function actionsCell(v, p) {
        const b = el("button", "cl-more");
        b.type = "button";
        b.setAttribute("aria-label", "Actions for " + fullName(p));
        b.setAttribute("aria-haspopup", "menu");
        b.appendChild(icon("fa-solid fa-ellipsis"));
        b.addEventListener("click", function () {
            const wasOpen = menuOwner === b;
            closeMenu();
            if (!wasOpen) openMenu(b, menuItems(v, p));
        });
        const cell = el("td");
        cell.appendChild(b);
        return cell;
    }

    // ---------- table pieces ----------
    function td(child) {
        const cell = el("td");
        if (typeof child === "string") cell.textContent = child; else if (child) cell.appendChild(child);
        return cell;
    }

    function patientCell(v, p) {
        const emergency = v.source === "emergency" || (p && p.patientType === "Emergency");
        const nameLine = el("div", "q-name");
        nameLine.appendChild(el("span", "", fullName(p)));
        if (emergency) {
            const flag = el("span", "q-flag");
            flag.title = "Emergency case";
            flag.setAttribute("aria-label", "Emergency case");
            flag.appendChild(icon("fa-solid fa-flag"));
            nameLine.appendChild(flag);
        }
        const meta = p ? [p.gender, EMR.ageAndDob(p.dateOfBirth)].filter(Boolean).join(" • ") : "";
        const text = el("div", "q-patient-text");
        text.append(nameLine, el("div", "q-meta", meta));
        const who = el("div", "q-patient");
        who.append(EMR.photoElement(p, "q-avatar"), text);
        return td(who);
    }

    function visitTag(v, visits) {
        const isNew = EMR.isNewToClinic(v, visits);
        return td(el("span", "visit-tag " + (isNew ? "visit-new" : "visit-followup"), isNew ? "New" : "Follow-up"));
    }

    function statusCell(v) {
        const known = has(EMR.STATUS_LABELS, v.status);
        return td(el("span", known ? "q-status status-" + v.status : "q-status", known ? EMR.STATUS_LABELS[v.status] : "Unknown"));
    }

    function table(headers, rows, emptyText) {
        const wrap = el("div", "queue-table-wrap");
        const t = el("table", "queue-table");
        const hr = el("tr");
        headers.forEach(function (h) { hr.appendChild(el("th", "", h)); });
        const head = el("thead");
        head.appendChild(hr);
        const tb = el("tbody");
        rows.forEach(function (r) { tb.appendChild(r); });
        if (!rows.length) {
            const c = el("td", "", emptyText);
            c.colSpan = headers.length;
            const r = el("tr", "cl-empty");
            r.appendChild(c);
            tb.appendChild(r);
        }
        t.append(head, tb);
        wrap.appendChild(t);
        return wrap;
    }

    function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

    function doctorName(v, doctors) {
        const d = v.doctorId ? doctors.find(function (x) { return x && x.id === v.doctorId; }) : null;
        return d ? d.name : "—";
    }

    function doctorRow(d, onDuty) {
        const days = d.days.filter(function (n) { return Number.isInteger(n) && n >= 0 && n <= 6; })
            .map(function (n) { return CLINIC.DAY_NAMES[n]; }).join(", ");
        const dot = el("span", "cl-dot" + (onDuty ? "" : " is-off"));
        dot.title = onDuty ? "On duty today" : "Not on duty today";
        const text = el("div", "cl-doctor-text");
        text.append(el("strong", "", d.name), el("small", "", [typeof d.specialty === "string" ? d.specialty : "", days].filter(Boolean).join(" · ")));
        const remove = el("button", "cl-icon-btn cl-remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + d.name);
        remove.title = "Remove " + d.name;
        remove.appendChild(icon("fa-solid fa-xmark"));
        remove.addEventListener("click", function () {
            if (!confirm("Remove " + d.name + " from this clinic's doctors?")) return;
            let m;
            try { m = CLINIC.removeDoctor(d.id); } catch (e) { m = "Could not remove the doctor."; }
            msg.textContent = m;
            render();
        });
        const item = el("div", "cl-doctor");
        item.append(dot, text, remove);
        return item;
    }

    function statCard(tone, iconCls, label, n) {
        const ic = el("span", "cl-stat-icon");
        ic.appendChild(icon(iconCls));
        const text = el("div", "cl-stat-text");
        text.append(el("span", "cl-stat-label", label), el("strong", "cl-stat-value", String(n)));
        const s = el("div", "cl-stat tone-" + tone);
        s.append(ic, text);
        return s;
    }

    // ---------- views ----------
    function listView(visits) {
        const t = EMR.today();
        const wrap = el("div");
        const heading = el("div", "page-heading");
        heading.append(el("h1", "", "Clinics"), el("p", "", "Select a clinic to see today's doctors, appointments and waiting list."));
        const grid = el("div", "clinic-cards");
        EMR.CLINICS.forEach(function (c, i) {
            const today = visits.filter(function (v) { return v && v.clinicId === c.id && v.date === t && v.status !== "cancelled"; });
            const a = el("a", "clinic-card tone-" + TONES[i % TONES.length]);
            a.href = "#clinic=" + c.id;
            const ic = el("span", "clinic-card-icon");
            ic.appendChild(icon("fa-solid " + (ICONS[c.id] || "fa-hospital")));
            const text = el("span", "clinic-card-text");
            const line = function (n, label) { const s = el("span", "clinic-card-count"); s.append(el("strong", "", String(n)), document.createTextNode(" " + label)); return s; };
            text.append(el("span", "clinic-card-name", c.name),
                line(today.filter(function (v) { return v.source === "appointment"; }).length, "appointments"),
                line(today.filter(function (v) { return v.status === "checked-in"; }).length, "waiting"));
            a.append(ic, text, icon("fa-solid fa-chevron-right clinic-card-chevron"));
            grid.appendChild(a);
        });
        wrap.append(heading, grid);
        return wrap;
    }

    function landingView(c, visits, patients, doctors) {
        const t = EMR.today();
        const day = new Date().getDay();
        const byId = {};
        patients.forEach(function (p) { if (p) byId[p.id] = p; });
        const mine = visits.filter(function (v) { return v && v.clinicId === c.id && v.date === t && v.status !== "cancelled"; });
        const count = function (status) { return mine.filter(function (v) { return v.status === status; }).length; };
        const appts = mine.filter(function (v) { return v.source === "appointment"; }).sort(byTime);
        const queue = mine.filter(function (v) { return v.status === "checked-in" || v.status === "in-consultation"; }).sort(function (a, b) {
            return ((b.source === "emergency") - (a.source === "emergency")) || byTime(a, b);
        });
        const all = CLINIC.forClinic(c.id, doctors);
        const on = all.filter(function (d) { return CLINIC.onDuty(d, day); });
        const off = all.filter(function (d) { return !CLINIC.onDuty(d, day); });

        // --- header card ---
        const heroIcon = el("span", "cl-hero-icon");
        heroIcon.appendChild(icon("fa-solid " + (ICONS[c.id] || "fa-hospital")));
        const meta = el("p", "cl-hero-meta");
        [CLINIC.DAY_NAMES[day] + " " + t, plural(count("checked-in"), "patient waiting", "patients waiting"),
            plural(on.length, "doctor on duty", "doctors on duty")].forEach(function (s) { meta.appendChild(el("span", "", s)); });
        const heroText = el("div", "cl-hero-text");
        heroText.append(el("h1", "", c.name), meta);
        const hero = el("section", "cl-hero");
        hero.append(heroIcon, heroText);

        // --- stat cards ---
        const stats = el("div", "cl-stats");
        stats.append(
            statCard("blue", "fa-solid fa-user-clock", "Waiting", count("checked-in")),
            statCard("amber", "fa-solid fa-calendar-check", "Scheduled", count("scheduled")),
            statCard("green", "fa-solid fa-user-doctor", "With doctor", count("in-consultation")),
            statCard("purple", "fa-solid fa-circle-check", "Completed", count("done")));

        // --- queue card: tabs + search + table ---
        const tabDefs = [{ key: "waiting", label: "Waiting list", n: queue.length }, { key: "appointments", label: "Appointments", n: appts.length }];
        const tabBar = el("div", "cl-tabs");
        tabBar.setAttribute("role", "tablist");
        tabDefs.forEach(function (d) {
            const b = el("button", "cl-tab" + (tab === d.key ? " is-active" : ""));
            b.type = "button";
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", tab === d.key ? "true" : "false");
            b.append(document.createTextNode(d.label), el("span", "cl-tab-count", String(d.n)));
            b.addEventListener("click", function () { tab = d.key; render(); });
            tabBar.appendChild(b);
        });

        const input = el("input", "cl-search-input");
        input.type = "text";
        input.placeholder = "Search patient...";
        input.autocomplete = "off";
        input.maxLength = 60;
        input.value = search;
        input.setAttribute("aria-label", "Search patients");
        const searchBox = el("label", "cl-search");
        searchBox.append(icon("fa-solid fa-magnifying-glass"), input);

        const head = el("div", "cl-queue-head");
        head.append(tabBar, searchBox);

        let headers, rows, emptyText;
        if (tab === "appointments") {
            headers = ["Time", "Patient", "Visit", "Doctor", "Status", "Actions"];
            emptyText = "No appointments today.";
            rows = appts.map(function (v) {
                const p = byId[v.patientId];
                const r = el("tr");
                r.dataset.q = fullName(p).toLowerCase();
                r.append(td(String(v.time)), patientCell(v, p), visitTag(v, visits), td(doctorName(v, all)), statusCell(v), actionsCell(v, p));
                return r;
            });
        } else {
            headers = ["#", "Arrived", "Patient", "Visit", "Doctor", "Status", "Actions"];
            emptyText = "Nobody is waiting.";
            rows = queue.map(function (v, i) {
                const p = byId[v.patientId];
                const r = el("tr");
                r.dataset.q = fullName(p).toLowerCase();
                r.append(td(String(i + 1)), td(String(v.time)), patientCell(v, p), visitTag(v, visits), td(doctorName(v, all)), statusCell(v), actionsCell(v, p));
                return r;
            });
        }
        const tableWrap = table(headers, rows, emptyText);
        const noMatch = el("tr", "cl-empty hidden");
        const noMatchCell = el("td", "", "No patients match your search.");
        noMatchCell.colSpan = headers.length;
        noMatch.appendChild(noMatchCell);
        tableWrap.querySelector("tbody").appendChild(noMatch);

        function applySearch() {
            const q = search.trim().toLowerCase();
            let shown = 0;
            rows.forEach(function (r) {
                const hit = !q || r.dataset.q.indexOf(q) !== -1;
                r.classList.toggle("hidden", !hit);
                if (hit) shown++;
            });
            noMatch.classList.toggle("hidden", !(q && rows.length && !shown));
        }
        input.addEventListener("input", function () { search = input.value; applySearch(); });
        applySearch();

        const queueCard = el("section", "cl-queue");
        queueCard.append(head, tableWrap);

        // --- doctors panel ---
        const panelIcon = el("span", "cl-panel-icon");
        panelIcon.appendChild(icon("fa-solid fa-user-doctor"));
        const panelText = el("div");
        panelText.append(el("h2", "", "Doctors in clinic"), el("p", "", on.length + " on duty today"));
        const panelClose = el("button", "cl-icon-btn cl-panel-close");
        panelClose.type = "button";
        panelClose.setAttribute("aria-label", "Close doctors panel");
        panelClose.appendChild(icon("fa-solid fa-xmark"));
        panelClose.addEventListener("click", function () { setDocs(false, true); });
        const panelHead = el("div", "cl-panel-head");
        panelHead.append(panelIcon, panelText, panelClose);

        const list = el("div", "cl-doctor-list");
        on.forEach(function (d) { list.appendChild(doctorRow(d, true)); });
        if (!on.length) list.appendChild(el("p", "cl-none", "No doctors are on duty today."));
        const panel = el("aside", "cl-panel" + (docsOpen ? "" : " hidden"));
        panel.id = "clDoctorsPanel";
        panel.setAttribute("aria-label", "Doctors in clinic");
        panel.append(panelHead, list);
        if (off.length) {
            const details = el("details", "cl-off");
            details.appendChild(el("summary", "", "Not on duty today (" + off.length + ")"));
            const offList = el("div", "cl-doctor-list");
            off.forEach(function (d) { offList.appendChild(doctorRow(d, false)); });
            details.appendChild(offList);
            panel.appendChild(details);
        }
        const add = el("button", "primary-btn cl-add-doctor", "Add doctor");
        add.type = "button";
        add.prepend(icon("fa-solid fa-plus"));
        add.addEventListener("click", function () { msg.textContent = ""; openModal("Add doctor", c.name, doctorForm(c)); });
        panel.appendChild(add);

        // --- floating button that opens the doctors panel ---
        const fab = el("button", "cl-fab" + (docsOpen ? " is-open" : ""));
        fab.type = "button";
        fab.id = "clDoctorsFab";
        fab.title = "Doctors in clinic";
        fab.setAttribute("aria-label", "Doctors in clinic, " + on.length + " on duty today");
        fab.setAttribute("aria-controls", "clDoctorsPanel");
        fab.setAttribute("aria-expanded", docsOpen ? "true" : "false");
        fab.append(icon("fa-solid fa-user-doctor"), el("span", "cl-fab-badge", String(on.length)));
        fab.addEventListener("click", function () { setDocs(!docsOpen); });

        // --- assemble ---
        const back = el("a", "cl-back");
        back.href = "#";
        back.append(icon("fa-solid fa-arrow-left"), document.createTextNode(" All clinics"));
        const main = el("div", "cl-main");
        main.append(hero, stats, queueCard);
        const wrap = el("div");
        wrap.append(back, main, panel, fab);
        return wrap;
    }

    function render() {
        closeMenu();
        let visits, patients, doctors;
        try {
            visits = EMR.getVisits();
            patients = EMR.getPatients();
            doctors = CLINIC.getDoctors();
        } catch (e) {
            root.replaceChildren(el("p", "search-status error", "Could not read clinic data."));
            return;
        }
        const id = clinicId();
        const c = id ? EMR.clinic(id) : null;
        if (id && !c) {
            const nf = el("div");
            const back = el("a", "cl-back", "All clinics");
            back.href = "#";
            nf.append(back, el("p", "search-status error", "That clinic does not exist."));
            root.replaceChildren(nf);
            return;
        }
        root.replaceChildren(c ? landingView(c, visits, patients, doctors) : listView(visits));
    }

    window.addEventListener("hashchange", function () { closeModal(); msg.textContent = ""; tab = "waiting"; search = ""; docsOpen = false; render(); });
    window.addEventListener("storage", function (event) {
        if (["visits", "patients", "vitals", "doctors"].indexOf(event.key) !== -1) render();
    });
    // Skip the periodic refresh while the person is typing in search or has a row menu open.
    setInterval(function () {
        const a = document.activeElement;
        if (menuEl || (a && a.classList && a.classList.contains("cl-search-input"))) return;
        render();
    }, 30000);
    render();
})();