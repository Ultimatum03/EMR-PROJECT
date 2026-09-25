// Live patient queue per clinic. "Live" = updates instantly across tabs in this browser
// (storage event) plus a 30s refresh. Multi-computer updates need the backend.
(function () {
    const tabs = document.getElementById("clinicTabs");
    const body = document.getElementById("queueBody");
    const errorBox = document.getElementById("queueError");

    // Waiting and in-consultation first, then not-yet-arrived, then finished.
    const STATUS_ORDER = { "in-consultation": 0, "checked-in": 1, "scheduled": 2, "done": 3 };
    const ACTION_LABELS = { "checked-in": "Check in", "in-consultation": "Start consultation", "done": "Complete" };
    const SOURCE_LABELS = { "appointment": "Appointment", "walk-in": "Walk-in", "emergency": "Emergency" };

    function selectedClinicId() {
        const match = /^#clinic=([\w-]+)$/.exec(location.hash);
        const id = match && EMR.clinic(match[1]) ? match[1] : EMR.CLINICS[0].id;
        return id;
    }

    function cell(text) {
        const td = document.createElement("td");
        td.textContent = text;
        return td;
    }

    function badge(text, className) {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        return span;
    }

    function renderTabs(current, visits) {
        const today = EMR.today();
        tabs.replaceChildren();
        EMR.CLINICS.forEach(function (c) {
            const load = visits.filter(function (v) {
                return v.clinicId === c.id && v.date === today && v.status !== "cancelled";
            }).length;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "clinic-tab" + (c.id === current ? " active" : "");
            btn.setAttribute("role", "tab");
            btn.setAttribute("aria-selected", String(c.id === current));
            btn.append(badge(c.name, "clinic-tab-name"),
                badge(load + (c.capacity === null ? "" : " / " + c.capacity), "clinic-tab-load"));
            btn.addEventListener("click", function () { location.hash = "clinic=" + c.id; });
            tabs.appendChild(btn);
        });
    }

    function render() {
        errorBox.textContent = "";
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

        document.getElementById("queueTitle").textContent = clinic.name;
        const count = function (status) { return queue.filter(function (v) { return v.status === status; }).length; };
        document.getElementById("queueSummary").textContent =
            "Waiting " + count("checked-in") + " · With doctor " + count("in-consultation") +
            " · Not arrived " + count("scheduled") + " · Done " + count("done") +
            " · Load " + queue.length + (clinic.capacity === null ? "" : " / " + clinic.capacity);

        body.replaceChildren();
        if (!queue.length) {
            const td = cell("No patients in this clinic's queue today.");
            td.colSpan = 6;
            td.className = "empty-state";
            const tr = document.createElement("tr");
            tr.appendChild(td);
            body.appendChild(tr);
            return;
        }

        queue.forEach(function (v) {
            const p = byId[v.patientId];
            const tr = document.createElement("tr");
            const emergency = v.source === "emergency" || (p && p.patientType === "Emergency");
            if (emergency) tr.classList.add("emergency-row");
            tr.appendChild(cell(v.time));

            const patientTd = document.createElement("td");
            const wrap = document.createElement("div");
            wrap.className = "name-cell";
            const name = badge(p ? p.firstName + " " + p.lastName : "Unknown patient", "");
            const id = badge(v.patientId, "queue-patient-id");
            wrap.append(EMR.photoElement(p, "table-photo"), name, id);
            if (emergency) wrap.appendChild(EMR.emergencyFlag());
            patientTd.appendChild(wrap);
            tr.appendChild(patientTd);

            tr.appendChild(cell(SOURCE_LABELS[v.source] || v.source));

            const newTd = document.createElement("td");
            const isNew = EMR.isNewToClinic(v, visits);
            newTd.appendChild(badge(isNew ? "New" : "Follow-up", "visit-kind " + (isNew ? "kind-new" : "kind-followup")));
            tr.appendChild(newTd);

            const statusTd = document.createElement("td");
            statusTd.appendChild(badge(EMR.STATUS_LABELS[v.status] || v.status, "visit-status status-" + v.status));
            tr.appendChild(statusTd);

            const actionTd = document.createElement("td");
            (EMR.NEXT_STATUS[v.status] || []).filter(function (s) { return ACTION_LABELS[s]; }).forEach(function (next) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = next === "checked-in" ? "primary-btn queue-btn" : "secondary-btn queue-btn";
                btn.textContent = ACTION_LABELS[next];
                btn.addEventListener("click", function () {
                    let error;
                    try { error = EMR.setVisitStatus(v.id, next); } catch (err) { error = "Could not save the change."; }
                    if (error) errorBox.textContent = error;
                    render();
                });
                actionTd.appendChild(btn);
            });
            tr.appendChild(actionTd);
            body.appendChild(tr);
        });
    }

    function tickClock() {
        document.getElementById("queueClock").textContent = EMR.today() + " " + EMR.nowTime();
    }

    window.addEventListener("hashchange", render);
    window.addEventListener("storage", function (event) {
        if (event.key === "visits" || event.key === "patients") render();
    });
    setInterval(function () { tickClock(); render(); }, 30000);
    tickClock();
    render();
})();
