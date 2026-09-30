// Nurse station: today's waiting ("checked-in") visits, and a form to record vitals.
// DOM is built with textContent only. Class names come from whitelists, never from stored values.
(function () {
    if (!EMR_AUTH.getSession()) return; // requireAccess() is already redirecting; render nothing.

    const body = document.getElementById("nurseBody");
    const errorBox = document.getElementById("nurseError");
    const modal = document.getElementById("vitalsModal");
    const form = document.getElementById("vitalsForm");
    const formError = document.getElementById("vitalsError");
    const saveBtn = document.getElementById("vitalsSave");
    const TYPES = {
        "appointment": { label: "Appointment", icon: "fa-regular fa-calendar" },
        "walk-in": { label: "Walk-in", icon: "fa-solid fa-person-walking" },
        "emergency": { label: "Emergency", icon: "fa-solid fa-truck-medical" }
    };
    let currentVisitId = null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }
    function icon(cls) { const i = el("i", cls); i.setAttribute("aria-hidden", "true"); return i; }

    // ---------- form (built once from NURSE.FIELDS so limits live in one place) ----------
    const inputs = {};
    NURSE.FIELDS.forEach(function (f) {
        const group = el("div", "form-group");
        const label = el("label", "", f.label + " (" + f.unit + ")");
        const input = el("input");
        input.id = "vt-" + f.key;
        input.type = "text";
        input.inputMode = "decimal";
        input.autocomplete = "off";
        input.maxLength = 6;
        label.htmlFor = input.id;
        inputs[f.key] = input;
        group.append(label, input);
        document.getElementById("vitalsFields").appendChild(group);
    });
    const noteGroup = el("div", "form-group nurse-note-field");
    const noteLabel = el("label", "", "Note (optional)");
    const note = el("textarea");
    note.id = "vt-note";
    note.rows = 3;
    note.maxLength = NURSE.NOTE_MAX;
    noteLabel.htmlFor = note.id;
    noteGroup.append(noteLabel, note);
    document.getElementById("vitalsFields").appendChild(noteGroup);

    function openModal(visit, patient) {
        currentVisitId = visit.id;
        form.reset();
        formError.textContent = "";
        saveBtn.disabled = false;
        document.getElementById("vitalsSub").textContent =
            (patient ? patient.firstName + " " + patient.lastName : "Unknown patient") + " · " + visit.patientId;
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        inputs[NURSE.FIELDS[0].key].focus();
    }
    function closeModal() {
        currentVisitId = null;
        modal.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }
    document.getElementById("vitalsClose").addEventListener("click", closeModal);
    document.getElementById("vitalsCancel").addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!currentVisitId) return;
        const data = { note: note.value };
        NURSE.FIELDS.forEach(function (f) { data[f.key] = inputs[f.key].value; });
        let message;
        try { message = NURSE.addVitals(currentVisitId, data); } catch (err) { message = "Could not save vitals."; }
        formError.textContent = message;
        if (message) return;
        closeModal();
        render();
    });

    // ---------- ward cards + bed-capacity modal ----------
    const wardModal = document.getElementById("wardModal");
    const wardBody = document.getElementById("wardBody");
    const WARD_ICONS = { male: "fa-solid fa-person", female: "fa-solid fa-person-dress", children: "fa-solid fa-baby" };
    const wardCounts = {};
    const wardSubs = {};
    let openWardId = null;
    let wardOpener = null;

    WARD.WARDS.forEach(function (w) {
        const b = el("button", "ward-card ward-" + w.id);
        b.type = "button";
        b.setAttribute("aria-haspopup", "dialog");
        const ic = el("span", "ward-card-icon");
        ic.appendChild(icon(WARD_ICONS[w.id] || "fa-solid fa-bed"));
        wardCounts[w.id] = el("strong", "ward-card-count", "0");
        wardSubs[w.id] = el("span", "ward-card-sub", "patients waiting");
        const text = el("span", "ward-card-text");
        text.append(el("span", "ward-card-name", w.name), wardCounts[w.id], wardSubs[w.id]);
        b.append(ic, text, icon("fa-solid fa-chevron-right ward-card-chevron"));
        b.addEventListener("click", function () { wardOpener = b; openWard(w.id); });
        document.getElementById("wardCards").appendChild(b);
    });

    function renderWards(waiting, byId) {
        const n = {};
        WARD.WARDS.forEach(function (w) { n[w.id] = 0; });
        waiting.forEach(function (v) {
            const id = WARD.wardFor(byId[v.patientId]);
            if (id && Object.prototype.hasOwnProperty.call(n, id)) n[id]++;
        });
        WARD.WARDS.forEach(function (w) {
            wardCounts[w.id].textContent = String(n[w.id]);
            wardSubs[w.id].textContent = n[w.id] === 1 ? "patient waiting" : "patients waiting";
        });
    }

    function wardStat(kind, label, value) {
        const s = el("div", "ward-stat " + kind);
        s.append(el("span", "ward-stat-label", label), el("strong", "ward-stat-value", String(value)));
        return s;
    }

    function fillWard(id) {
        const w = WARD.WARDS.find(function (x) { return x.id === id; });
        if (!w) return;
        document.getElementById("wardTitle").textContent = w.name;
        document.getElementById("wardSub").textContent = "Bed capacity";
        let beds;
        try { beds = WARD.getBeds(id); } catch (err) { beds = null; }
        if (!beds) {
            wardBody.replaceChildren(el("p", "search-status error", "Could not read bed data."));
            return;
        }
        const pct = beds.total ? Math.round(beds.occupied / beds.total * 100) : 0;
        const stats = el("div", "ward-stats");
        stats.append(wardStat("is-total", "Total beds", beds.total),
            wardStat("is-occupied", "Occupied", beds.occupied),
            wardStat("is-available", "Available", beds.available));
        const row = el("div", "ward-occupancy-row");
        const pctText = el("strong", "", beds.total ? pct + "%" : "No beds set up");
        row.append(el("span", "", "Occupancy"), pctText);
        const fill = el("div", "ward-bar-fill" + (pct >= 90 ? " level-high" : pct >= 70 ? " level-mid" : ""));
        fill.style.width = pct + "%";
        const bar = el("div", "ward-bar");
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(pct));
        bar.setAttribute("aria-label", w.name + " occupancy");
        bar.appendChild(fill);
        wardBody.replaceChildren(stats, row, bar);
    }

    function openWard(id) {
        openWardId = id;
        fillWard(id);
        wardModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        document.getElementById("wardClose").focus();
    }
    function closeWard() {
        openWardId = null;
        wardModal.classList.add("hidden");
        document.body.classList.remove("modal-open");
        wardBody.replaceChildren();
        if (wardOpener) wardOpener.focus();
    }
    document.getElementById("wardClose").addEventListener("click", closeWard);
    wardModal.addEventListener("click", function (event) { if (event.target === wardModal) closeWard(); });
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !wardModal.classList.contains("hidden")) closeWard();
    });

    // ---------- table ----------
    function timeText(iso) {
        const d = new Date(iso);
        return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }

    function render() {
        let visits, patients, vitals;
        try {
            visits = EMR.getVisits();
            patients = EMR.getPatients();
            vitals = NURSE.getVitals();
        } catch (err) {
            errorBox.textContent = "Could not read station data.";
            body.replaceChildren();
            document.getElementById("nurseCount").textContent = "";
            return;
        }
        errorBox.textContent = "";
        const byId = {};
        patients.forEach(function (p) { byId[p.id] = p; });
        const today = EMR.today();
        const waiting = visits.filter(function (v) {
            return v.date === today && v.status === "checked-in";
        }).sort(function (a, b) {
            const e = (b.source === "emergency") - (a.source === "emergency"); // emergencies first
            return e || String(a.time).localeCompare(String(b.time));
        });

        renderWards(waiting, byId);
        if (openWardId) fillWard(openWardId);

        body.replaceChildren();
        if (!waiting.length) {
            const td = el("td", "empty-state");
            td.colSpan = 8;
            td.appendChild(el("strong", "", "No patients are waiting right now"));
            const tr = el("tr");
            tr.appendChild(td);
            body.appendChild(tr);
        }
        waiting.forEach(function (v, i) {
            const p = byId[v.patientId];
            const c = EMR.clinic(v.clinicId);
            const tr = el("tr");
            const emergency = v.source === "emergency" || (p && p.patientType === "Emergency");
            if (emergency) tr.classList.add("emergency-row");

            tr.appendChild(el("td", "q-index", String(i + 1)));
            tr.appendChild(el("td", "q-time", v.time));

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
            const patientTd = el("td");
            patientTd.appendChild(who);
            tr.appendChild(patientTd);

            tr.appendChild(el("td", "q-pid", v.patientId));
            tr.appendChild(el("td", "", c ? c.name : "Unknown clinic"));

            const typeTd = el("td");
            const t = TYPES[v.source];
            const badge = el("span", t ? "q-type type-" + v.source : "q-type");
            if (t) badge.append(icon(t.icon), document.createTextNode(" " + t.label));
            else badge.textContent = "Unknown";
            typeTd.appendChild(badge);
            tr.appendChild(typeTd);

            const last = NURSE.latestForVisit(v.id, vitals);
            const at = last ? timeText(last.recordedAt) : "";
            tr.appendChild(el("td", last ? "nurse-taken" : "nurse-not-taken",
                last ? "Taken" + (at ? " " + at : "") + (typeof last.recordedBy === "string" ? " by " + last.recordedBy : "") : "Not taken"));

            const actionTd = el("td");
            const btn = el("button", "view-btn");
            btn.type = "button";
            btn.append(icon("fa-solid fa-heart-pulse"), document.createTextNode(last ? " Record again" : " Record vitals"));
            btn.addEventListener("click", function () { openModal(v, p); });
            actionTd.appendChild(btn);
            tr.appendChild(actionTd);

            body.appendChild(tr);
        });

        document.getElementById("nurseCount").textContent =
            waiting.length + " patient" + (waiting.length === 1 ? "" : "s") + " waiting";
    }

    window.addEventListener("storage", function (event) {
        if (event.key === "visits" || event.key === "patients" || event.key === "vitals" || event.key === "wardBeds") render();
    });
    setInterval(render, 30000);
    render();
})();