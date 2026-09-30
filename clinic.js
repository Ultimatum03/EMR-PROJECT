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

    function iconBtn(label, iconCls, enabled, whyNot, onClick) {
        const b = el("button", "cl-icon-btn");
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.title = enabled ? label : label + " (unavailable: " + whyNot + ")";
        b.disabled = !enabled;
        b.appendChild(icon(iconCls));
        if (enabled) b.addEventListener("click", function () { msg.textContent = ""; onClick(); });
        return b;
    }

    function actionsCell(v, p) {
        const waiting = v.status === "checked-in";
        const box = el("div", "cl-actions");
        box.append(
            iconBtn("Triage", "fa-solid fa-heart-pulse", waiting, "patient is not waiting", function () {
                openModal("Triage: record vitals", fullName(p) + " · " + v.patientId, triageForm(v));
            }),
            iconBtn("Open encounter", "fa-solid fa-notes-medical", waiting, "patient is not waiting", function () { openEncounter(v); }),
            iconBtn("Existing records", "fa-solid fa-folder-open", !!p, "patient record not found", function () { showRecords(p); }),
            iconBtn("Transfer", "fa-solid fa-right-left", v.status === "scheduled" || waiting, "only scheduled or waiting patients", function () {
                openModal("Transfer patient", fullName(p) + " · " + v.patientId, transferForm(v));
            })
        );
        const td = el("td");
        td.appendChild(box);
        return td;
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

    function card(title, sub, body, extra) {
        const head = el("div", "cl-card-head");
        const titles = el("div");
        titles.append(el("h2", "", title), el("p", "", sub));
        head.appendChild(titles);
        if (extra) head.appendChild(extra);
        const c = el("section", "cl-card");
        c.append(head, body);
        return c;
    }

    function doctorItem(d) {
        const days = d.days.filter(function (n) { return Number.isInteger(n) && n >= 0 && n <= 6; })
            .map(function (n) { return CLINIC.DAY_NAMES[n]; }).join(", ");
        const text = el("div", "cl-doctor-text");
        text.append(el("strong", "", d.name), el("small", "", [typeof d.specialty === "string" ? d.specialty : "", days].filter(Boolean).join(" · ")));
        const avatar = el("span", "cl-doctor-avatar");
        avatar.appendChild(icon("fa-solid fa-user-doctor"));
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
        item.append(avatar, text, remove);
        return item;
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
        const appts = mine.filter(function (v) { return v.source === "appointment"; }).sort(byTime);
        const waiting = mine.filter(function (v) { return v.status === "checked-in"; }).sort(function (a, b) {
            return ((b.source === "emergency") - (a.source === "emergency")) || byTime(a, b);
        });
        const all = CLINIC.forClinic(c.id, doctors);
        const on = all.filter(function (d) { return CLINIC.onDuty(d, day); });
        const off = all.filter(function (d) { return !CLINIC.onDuty(d, day); });

        const wrap = el("div");
        const back = el("a", "cl-back");
        back.href = "#";
        back.append(icon("fa-solid fa-arrow-left"), document.createTextNode(" All clinics"));
        const heading = el("div", "page-heading");
        heading.append(el("h1", "", c.name), el("p", "", CLINIC.DAY_NAMES[day] + " " + t));

        const docBody = el("div");
        const docGrid = el("div", "cl-doctors");
        on.forEach(function (d) { docGrid.appendChild(doctorItem(d)); });
        docBody.appendChild(on.length ? docGrid : el("p", "cl-none", "No doctors are on duty today."));
        if (off.length) {
            const details = el("details", "cl-off");
            details.appendChild(el("summary", "", "Not on duty today (" + off.length + ")"));
            const offGrid = el("div", "cl-doctors");
            off.forEach(function (d) { offGrid.appendChild(doctorItem(d)); });
            details.appendChild(offGrid);
            docBody.appendChild(details);
        }
        const add = el("button", "primary-btn", "Add doctor");
        add.type = "button";
        add.addEventListener("click", function () { msg.textContent = ""; openModal("Add doctor", c.name, doctorForm(c)); });

        const apptRows = appts.map(function (v) {
            const p = byId[v.patientId];
            const r = el("tr");
            r.append(td(String(v.time)), patientCell(v, p), visitTag(v, visits), statusCell(v), actionsCell(v, p));
            return r;
        });
        const waitRows = waiting.map(function (v, i) {
            const p = byId[v.patientId];
            const r = el("tr");
            r.append(td(String(i + 1)), td(String(v.time)), patientCell(v, p), visitTag(v, visits),
                td(has(TYPES, v.source) ? TYPES[v.source] : "Unknown"), actionsCell(v, p));
            return r;
        });

        wrap.append(back, heading,
            card("Doctors on duty today", on.length + " on duty", docBody, add),
            card("Appointments today", appts.length + (appts.length === 1 ? " appointment" : " appointments"),
                table(["Time", "Patient", "Visit", "Status", "Actions"], apptRows, "No appointments today.")),
            card("Waiting list", waiting.length + " waiting",
                table(["#", "Arrived", "Patient", "Visit", "Type", "Actions"], waitRows, "Nobody is waiting.")));
        return wrap;
    }

    function render() {
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

    window.addEventListener("hashchange", function () { closeModal(); msg.textContent = ""; render(); });
    window.addEventListener("storage", function (event) {
        if (["visits", "patients", "vitals", "doctors"].indexOf(event.key) !== -1) render();
    });
    setInterval(render, 30000);
    render();
})();