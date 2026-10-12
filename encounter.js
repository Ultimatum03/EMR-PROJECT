// Open encounter: patient banner, typed clinical notes, and lab / diagnostic / prescription orders.
// Saved per visit under localStorage "encounters" (swap for API calls later). DOM uses textContent only.
(function () {
    if (!EMR_AUTH.getSession()) return;
    const $ = function (id) { return document.getElementById(id); };
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function ic(cls) { const i = el("i", cls); i.setAttribute("aria-hidden", "true"); return i; }

    const KEY = "encounters";
    const visitId = new URLSearchParams(location.search).get("visit");
    const MAX = 5000; // characters per note section, single-box note and addendum
    function sec(key, title, prompt, chips) { return { key: key, title: title, prompt: prompt, chips: chips || [] }; }
    // Types with "sections" get the tabbed editor; a type without them (nursing) stays a single box.
    const NOTES = {
        doctor: { label: "Doctor's note", icon: "fa-solid fa-user-doctor", sections: [
            sec("complaint", "Presenting complaint", "Why did the patient come in today?", ["Headache", "Fever", "Chest pain", "Abdominal pain", "Cough"]),
            sec("history", "History", "History of the complaint, past history and relevant background."),
            sec("exam", "Examination", "Findings on examination."),
            sec("assessment", "Assessment", "Working diagnosis and differentials."),
            sec("plan", "Plan", "Investigations, treatment and follow-up.")
        ] },
        round: { label: "General round note", icon: "fa-solid fa-people-arrows", sections: [
            sec("condition", "Condition today", "How is the patient today?"),
            sec("findings", "Examination findings", "Findings on examination."),
            sec("changes", "Changes to plan", "Any changes to the management plan.")
        ] },
        preop: { label: "Pre-op note", icon: "fa-solid fa-clipboard-check", sections: [
            sec("procedure", "Planned procedure", "What procedure is planned?"),
            sec("indication", "Indication", "Why is the procedure needed?"),
            sec("anaesthesia", "Anaesthesia plan", "Type of anaesthesia planned."),
            sec("allergies", "Allergies", "Known allergies and reactions."),
            sec("fasting", "Fasting status", "When did the patient last eat or drink?"),
            sec("consent", "Consent", "Consent obtained, and by whom.")
        ] },
        postop: { label: "Post-op note", icon: "fa-solid fa-bed-pulse", sections: [
            sec("procedure", "Procedure done", "What procedure was performed?"),
            sec("findings", "Findings", "Operative findings."),
            sec("complications", "Complications", "Any complications during or after the procedure."),
            sec("instructions", "Post-op instructions", "Instructions for post-operative care.")
        ] },
        nursing: { label: "Nursing note", icon: "fa-solid fa-user-nurse" },
        discharge: { label: "Discharge note", icon: "fa-solid fa-door-open", sections: [
            sec("diagnosis", "Diagnosis", "Diagnosis at discharge."),
            sec("summary", "Summary of care", "Summary of care during the stay."),
            sec("meds", "Medications on discharge", "Medications the patient goes home on."),
            sec("followup", "Follow-up", "Follow-up arrangements.")
        ] }
    };
    const CATALOG = {
        lab: ["Full blood count", "Malaria parasite", "Blood glucose", "Urinalysis", "Urea, electrolytes & creatinine", "Liver function test", "Lipid profile", "Widal test", "HIV screening", "Hepatitis B surface antigen", "Blood culture", "Genotype", "Pregnancy test"],
        diag: ["Chest X-ray", "Abdominal ultrasound", "Pelvic ultrasound", "ECG", "Echocardiogram", "CT head", "CT abdomen", "MRI spine", "Limb X-ray", "Doppler ultrasound"]
    };
    const TABS = { lab: "Lab", diag: "Diagnostics", rx: "Prescription" };
    const FREQ = ["Once daily", "Twice daily", "Three times daily", "Four times daily", "At night", "As needed", "Stat"];
    const ROUTE = ["Oral", "IV", "IM", "SC", "Topical", "Inhaled"];

    // ---------- storage (reads throw on corrupt data so nothing is overwritten) ----------
    function load() {
        const all = JSON.parse(localStorage.getItem(KEY)) || {};
        if (typeof all !== "object" || Array.isArray(all)) throw new Error("corrupt");
        return all;
    }
    function record() { return load()[visitId] || { notes: [], lab: [], diag: [], rx: [] }; }
    function save(fn) {
        const all = load();
        const rec = all[visitId] || (all[visitId] = { notes: [], lab: [], diag: [], rx: [] });
        fn(rec);
        localStorage.setItem(KEY, JSON.stringify(all));
    }
    function stamp() { return { id: EMR.newId("EN"), by: EMR_AUTH.getSession().username, at: new Date().toISOString() }; }
    function when(iso) { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

    $("encBack").addEventListener("click", function () { history.back(); });

    // ---------- visit + patient ----------
    let visit = null, patient = null;
    try {
        visit = EMR.getVisits().find(function (v) { return v.id === visitId; }) || null;
        patient = visit ? EMR.getPatient(visit.patientId) : null;
    } catch (err) { visit = null; }
    if (!visit) {
        $("encBanner").appendChild(el("p", "enc-empty", "No encounter selected. Open one from a clinic's waiting list."));
        document.querySelector(".enc-grid").classList.add("hidden");
        return;
    }

    function renderBanner() {
        const b = $("encBanner");
        const emergency = visit.source === "emergency" || (patient && patient.patientType === "Emergency");
        const clinic = EMR.clinic(visit.clinicId);
        const who = el("div", "enc-who");
        const h1 = el("h1", "", patient ? patient.firstName + " " + patient.lastName : "Unknown patient");
        if (emergency) h1.appendChild(el("span", "enc-flag", "Emergency"));
        const facts = el("div", "enc-facts");
        [["PID", visit.patientId], ["Sex", patient && patient.gender], ["Age / DOB", patient && EMR.ageAndDob(patient.dateOfBirth)],
            ["Clinic", clinic && clinic.name], ["Arrived", visit.time], ["Phone", patient && patient.phone]].forEach(function (f) {
            if (!f[1]) return;
            const s = el("span", "", f[0] + ": ");
            s.appendChild(el("strong", "", f[1]));
            facts.appendChild(s);
        });
        const text = el("div");
        text.append(h1, facts);
        who.append(EMR.photoElement(patient, "q-avatar"), text);

        const vitals = el("div", "enc-vitals");
        let last = null;
        try { last = NURSE.latestForVisit(visit.id); } catch (err) { last = null; }
        if (!last) vitals.appendChild(el("p", "enc-vitals-note", "No vitals recorded yet. The nurse station records them before consultation."));
        else {
            NURSE.FIELDS.filter(function (f) { return f.key !== "dia" && last[f.key] != null; }).forEach(function (f) {
                const cell = el("div", "enc-vital");
                const val = f.key === "sys" ? last.sys + "/" + last.dia : String(last[f.key]);
                const strong = el("strong", "", val + " ");
                strong.appendChild(el("small", "", f.unit));
                cell.append(el("span", "", f.key === "sys" ? "Blood pressure" : f.label), strong);
                vitals.appendChild(cell);
            });
            if (last.note) vitals.appendChild(el("p", "enc-vitals-note", "Nurse note: " + last.note));
        }
        b.replaceChildren(who, vitals);
    }

    // ---------- notes ----------
    const menu = $("noteMenu"), noteBtn = $("noteBtn");
    function setMenu(open) { menu.classList.toggle("hidden", !open); noteBtn.setAttribute("aria-expanded", String(open)); }
    Object.keys(NOTES).forEach(function (k) {
        const b = el("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.append(ic(NOTES[k].icon), document.createTextNode(NOTES[k].label));
        b.addEventListener("click", function () { setMenu(false); startNote(k); });
        menu.appendChild(b);
    });
    noteBtn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.classList.contains("hidden")); });
    document.addEventListener("click", function () { setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

    let ed = null;          // tabbed editor state: { id, type, idx, saved, confirm, msg, ta, errEl }
    let addFor = null;      // id of the note whose addendum form is open
    let addText = "";

    // Opens (or resumes) a note. Templated types get the tabbed editor, nursing the single box.
    function startNote(type) {
        if (ed && !commitSection()) return;
        ed = null;
        if (!NOTES[type].sections) { openSimpleEditor(type); return; }
        let draft = null;
        try {
            draft = record().notes.find(function (n) { return n.type === type && n.status === "draft"; }) || null;
        } catch (e) { $("noteEditor").replaceChildren(el("p", "enc-err", "Could not read notes.")); return; }
        const saved = draft ? Object.assign({}, draft.sections) : {};
        const first = NOTES[type].sections.findIndex(function (s) { return !saved[s.key]; });
        ed = { id: draft ? draft.id : null, type: type, idx: first === -1 ? 0 : first, saved: saved, confirm: false, msg: "", ta: null, errEl: null };
        renderWizard();
    }

    // Autosaves the visible section as a draft. Blank text on a never-saved section writes nothing.
    function commitSection() {
        const s = NOTES[ed.type].sections[ed.idx];
        const val = ed.ta.value.trim();
        if (val === (ed.saved[s.key] || "")) return true;
        let nid = ed.id;
        try {
            save(function (r) {
                let note = nid ? r.notes.find(function (n) { return n.id === nid && n.status === "draft"; }) : null;
                if (!note) {
                    note = Object.assign(stamp(), { type: ed.type, status: "draft", sections: {}, addenda: [] });
                    r.notes.unshift(note);
                }
                note.sections[s.key] = val;
                nid = note.id;
            });
        } catch (e) { ed.errEl.textContent = "Could not save (storage unreadable or full)."; return false; }
        ed.id = nid;
        ed.saved[s.key] = val;
        renderNotes();
        return true;
    }

    function goTo(i) {
        if (!commitSection()) return;
        ed.idx = i;
        ed.confirm = false;
        ed.msg = "";
        renderWizard();
    }

    function completeNote(force) {
        if (!commitSection()) return;
        const secs = NOTES[ed.type].sections;
        const empty = secs.filter(function (x) { return !ed.saved[x.key]; }).length;
        if (empty === secs.length) { ed.errEl.textContent = "Answer at least one section before completing."; return; }
        if (empty && !force) { ed.confirm = true; ed.msg = ""; renderWizard(); return; }
        try {
            save(function (r) {
                const n = r.notes.find(function (x) { return x.id === ed.id && x.status === "draft"; });
                if (!n) throw new Error("missing");
                n.status = "final";
                n.done = new Date().toISOString();
            });
        } catch (e) { ed.errEl.textContent = "Could not complete the note (storage unreadable or full)."; return; }
        ed = null;
        $("noteEditor").replaceChildren();
        renderNotes();
    }

    function renderWizard() {
        const def = NOTES[ed.type], secs = def.sections, s = secs[ed.idx], last = ed.idx === secs.length - 1;
        const answered = secs.filter(function (x) { return ed.saved[x.key]; }).length;
        const box = el("div", "enc-wiz");

        const head = el("div", "enc-wiz-head");
        const title = el("span", "enc-wiz-title");
        title.append(ic(def.icon), document.createTextNode(def.label));
        const close = el("button", "enc-ghost", "Close");
        close.type = "button";
        close.addEventListener("click", function () {
            if (!commitSection()) return;
            ed = null;
            $("noteEditor").replaceChildren();
        });
        head.append(title, close);

        const steps = el("div", "enc-steps");
        steps.setAttribute("role", "tablist");
        secs.forEach(function (x, i) {
            const done = !!ed.saved[x.key];
            const b = el("button", "enc-step" + (i === ed.idx ? " active" : ""));
            b.type = "button";
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", String(i === ed.idx));
            b.setAttribute("aria-label", x.title + (done ? ", answered" : ", empty"));
            const mark = done ? ic("fa-solid fa-circle-check enc-step-mark") : el("span", "enc-dot");
            if (!done) mark.setAttribute("aria-hidden", "true");
            b.append(document.createTextNode(x.title), mark);
            b.addEventListener("click", function () { goTo(i); });
            steps.appendChild(b);
        });

        const err = el("p", "enc-err");
        err.setAttribute("role", "alert");
        const card = el("div", "enc-sec-card");
        const sh = el("div", "enc-sec-head");
        sh.appendChild(el("h3", "", s.title));
        if (ed.saved[s.key]) {
            const a = el("span", "enc-answered");
            a.append(ic("fa-solid fa-circle-check"), document.createTextNode("Answered"));
            sh.appendChild(a);
        }
        const prompt = el("p", "enc-prompt", s.prompt);
        prompt.id = "encPrompt";
        const ta = el("textarea", "enc-wiz-text");
        ta.value = ed.saved[s.key] || "";
        ta.maxLength = MAX;
        ta.setAttribute("aria-label", s.title);
        ta.setAttribute("aria-describedby", "encPrompt");
        const count = el("span", "enc-count");
        const upd = function () { count.textContent = ta.value.length + "/" + MAX; };
        ta.addEventListener("input", upd);
        upd();
        const wrap = el("div", "enc-text-wrap");
        wrap.append(ta, count);
        card.append(sh, prompt, wrap);

        if (s.chips.length) {
            card.appendChild(el("p", "enc-quick-title", "Quick insert"));
            const row = el("div", "enc-chips");
            s.chips.forEach(function (c) {
                const b = el("button", "enc-chip", "+ " + c);
                b.type = "button";
                b.addEventListener("click", function () {
                    const cur = ta.value.replace(/\s+$/, "");
                    const next = !cur ? c : cur + (/,$/.test(cur) ? " " : ", ") + c;
                    if (next.length > MAX) { err.textContent = "Character limit reached."; return; }
                    err.textContent = "";
                    ta.value = next;
                    upd();
                    ta.focus();
                });
                row.appendChild(b);
            });
            card.appendChild(row);
        }
        card.appendChild(err);

        const foot = el("div", "enc-wiz-foot");
        const prog = el("div", "enc-prog");
        prog.appendChild(el("div", "enc-prog-text", answered + " of " + secs.length + " sections completed"));
        const bar = el("div", "enc-seg-row");
        bar.setAttribute("aria-hidden", "true");
        secs.forEach(function (x) { bar.appendChild(el("span", "enc-seg" + (ed.saved[x.key] ? " done" : ""))); });
        prog.appendChild(bar);

        const actions = el("div", "enc-actions");
        const prev = el("button", "enc-ghost", "Previous");
        prev.type = "button";
        prev.disabled = ed.idx === 0;
        prev.addEventListener("click", function () { goTo(ed.idx - 1); });
        actions.appendChild(prev);
        if (!last) {
            const next = el("button", "primary-btn enc-btn-icon", "Save & next section");
            next.type = "button";
            next.appendChild(ic("fa-solid fa-arrow-right"));
            next.addEventListener("click", function () { goTo(ed.idx + 1); });
            actions.appendChild(next);
        } else {
            const saveSec = el("button", "enc-ghost", "Save section");
            saveSec.type = "button";
            saveSec.addEventListener("click", function () {
                if (!commitSection()) return;
                ed.msg = "Section saved.";
                ed.confirm = false;
                renderWizard();
            });
            const done = el("button", "primary-btn", "Complete note");
            done.type = "button";
            done.addEventListener("click", function () { completeNote(false); });
            actions.append(saveSec, done);
        }
        foot.append(prog, actions);

        box.append(head, steps, card);
        if (ed.msg) {
            const st = el("p", "enc-saved", ed.msg);
            st.setAttribute("role", "status");
            box.appendChild(st);
        }
        if (ed.confirm) {
            const empty = secs.length - answered;
            const c = el("div", "enc-confirm");
            c.setAttribute("role", "alert");
            const keep = el("button", "enc-ghost", "Keep editing");
            keep.type = "button";
            keep.addEventListener("click", function () { ed.confirm = false; renderWizard(); });
            const yes = el("button", "primary-btn", "Complete anyway");
            yes.type = "button";
            yes.addEventListener("click", function () { completeNote(true); });
            c.append(el("p", "", empty + (empty === 1 ? " section is" : " sections are") + " still empty. Complete the note anyway?"), keep, yes);
            box.appendChild(c);
        }
        box.appendChild(foot);
        $("noteEditor").replaceChildren(box);
        ed.ta = ta;
        ed.errEl = err;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    // Single-box editor (nursing note).
    function openSimpleEditor(type) {
        const n = NOTES[type];
        const box = el("div", "enc-editor");
        const head = el("div", "enc-editor-head");
        head.append(ic(n.icon), document.createTextNode(n.label));
        const ta = el("textarea");
        ta.setAttribute("aria-label", n.label);
        ta.maxLength = MAX;
        const err = el("p", "enc-err");
        err.setAttribute("role", "alert");
        const cancel = el("button", "enc-ghost", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", function () { $("noteEditor").replaceChildren(); });
        const saveB = el("button", "primary-btn", "Save note");
        saveB.type = "button";
        saveB.addEventListener("click", function () {
            if (ta.value.trim() === "") { err.textContent = "Write something before saving."; return; }
            try { save(function (r) { r.notes.unshift(Object.assign(stamp(), { type: type, status: "final", text: ta.value.trim(), addenda: [] })); }); }
            catch (e) { err.textContent = "Could not save (storage unreadable or full)."; return; }
            $("noteEditor").replaceChildren();
            renderNotes();
        });
        const actions = el("div", "enc-actions");
        actions.append(cancel, saveB);
        box.append(head, ta, err, actions);
        $("noteEditor").replaceChildren(box);
        ta.focus();
    }

    function noteCard(n) {
        const t = NOTES[n.type] || { label: "Note" };
        const draft = n.status === "draft";
        const card = el("article", "enc-note");
        const meta = el("div", "enc-note-meta");
        meta.appendChild(el("span", "enc-badge", t.label));
        if (draft) meta.appendChild(el("span", "enc-badge enc-badge-draft", "Draft"));
        meta.appendChild(document.createTextNode(String(n.by || "") + " · " + when(n.done || n.at)));
        card.appendChild(meta);

        if (n.sections && t.sections) {
            t.sections.forEach(function (s) {
                const txt = n.sections[s.key] || "";
                const part = el("div", "enc-note-sec");
                part.append(el("div", "enc-note-sec-title", s.title),
                    el("div", txt ? "enc-note-sec-text" : "enc-note-sec-text enc-note-none", txt || (draft ? "Not yet answered" : "Not recorded")));
                card.appendChild(part);
            });
        } else {
            card.appendChild(el("div", "enc-note-body", n.text || ""));
        }

        (n.addenda || []).forEach(function (a) {
            const box = el("div", "enc-addendum");
            box.append(el("div", "enc-addendum-meta", "Addendum · " + String(a.by || "") + " · " + when(a.at)), el("div", "enc-note-body", a.text));
            card.appendChild(box);
        });

        if (draft) {
            const row = el("div", "enc-note-actions");
            const go = el("button", "enc-ghost", "Continue");
            go.type = "button";
            go.addEventListener("click", function () { startNote(n.type); });
            row.appendChild(go);
            card.appendChild(row);
        } else if (addFor === n.id) {
            const form = el("div", "enc-addendum-form");
            const ta = el("textarea", "enc-wiz-text enc-addendum-text");
            ta.value = addText;
            ta.maxLength = MAX;
            ta.setAttribute("aria-label", "Addendum");
            ta.addEventListener("input", function () { addText = ta.value; });
            const err = el("p", "enc-err");
            err.setAttribute("role", "alert");
            const cancel = el("button", "enc-ghost", "Cancel");
            cancel.type = "button";
            cancel.addEventListener("click", function () { addFor = null; addText = ""; renderNotes(); });
            const saveA = el("button", "primary-btn", "Save addendum");
            saveA.type = "button";
            saveA.addEventListener("click", function () {
                const v = ta.value.trim();
                if (!v) { err.textContent = "Write something before saving."; return; }
                try {
                    save(function (r) {
                        const note = r.notes.find(function (x) { return x.id === n.id; });
                        if (!note) throw new Error("missing");
                        (note.addenda || (note.addenda = [])).push(Object.assign(stamp(), { text: v }));
                    });
                } catch (e) { err.textContent = "Could not save (storage unreadable or full)."; return; }
                addFor = null;
                addText = "";
                renderNotes();
            });
            const actions = el("div", "enc-actions");
            actions.append(cancel, saveA);
            form.append(ta, err, actions);
            card.appendChild(form);
        } else {
            const row = el("div", "enc-note-actions");
            const add = el("button", "enc-ghost", "Add addendum");
            add.type = "button";
            add.addEventListener("click", function () {
                addFor = n.id;
                addText = "";
                renderNotes();
                const t2 = $("noteList").querySelector(".enc-addendum-text");
                if (t2) t2.focus();
            });
            row.appendChild(add);
            card.appendChild(row);
        }
        return card;
    }

    function renderNotes() {
        let notes;
        try { notes = record().notes; } catch (e) { $("noteList").replaceChildren(el("p", "enc-empty", "Could not read notes.")); return; }
        if (!notes.length) { $("noteList").replaceChildren(el("p", "enc-empty", "No notes yet. Select Note to start documenting.")); return; }
        $("noteList").replaceChildren.apply($("noteList"), notes.map(noteCard));
    }

    // ---------- orders ----------
    const draft = { lab: [], diag: [], rx: [] };
    let tab = "lab";
    const counts = {};

    function renderTabs() {
        const wrap = $("orderTabs");
        wrap.replaceChildren();
        Object.keys(TABS).forEach(function (k) {
            const b = el("button", "enc-tab" + (k === tab ? " active" : ""), TABS[k]);
            b.type = "button";
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", String(k === tab));
            counts[k] = el("em", "", "0");
            b.appendChild(counts[k]);
            b.addEventListener("click", function () { tab = k; renderOrders(); });
            wrap.appendChild(b);
        });
    }

    function field(label, control) {
        const l = el("label", "enc-field", label);
        l.appendChild(control);
        return l;
    }
    function select(options) {
        const s = el("select");
        options.forEach(function (o) { s.appendChild(el("option", "", o)); });
        return s;
    }
    function input(ph, max) { const i = el("input"); i.type = "text"; i.placeholder = ph || ""; i.maxLength = max || 120; return i; }

    function renderOrders() {
        let rec;
        try { rec = record(); } catch (e) { $("orderBody").replaceChildren(el("p", "enc-empty", "Could not read orders.")); return; }
        renderTabs();
        Object.keys(TABS).forEach(function (k) { counts[k].textContent = String(rec[k].length); });
        const body = el("div");
        const err = el("p", "enc-err");
        err.setAttribute("role", "alert");
        const send = el("button", "primary-btn", tab === "rx" ? "Send prescription" : "Send request");
        send.type = "button";
        const actions = el("div", "enc-actions");
        actions.appendChild(send);

        if (tab === "rx") {
            const drug = input("Drug name and strength, e.g. Amoxicillin 500 mg");
            const dose = input("e.g. 1 capsule", 40), dur = input("e.g. 5 days", 40);
            const freq = select(FREQ), route = select(ROUTE);
            const list = el("div");
            const paint = function () {
                list.replaceChildren.apply(list, draft.rx.map(function (d, i) {
                    const row = el("div", "enc-rx-item");
                    row.appendChild(el("span", "", d.drug + " · " + d.dose + " · " + d.route + " · " + d.freq + " · " + d.dur));
                    const x = el("button", "", "×");
                    x.type = "button";
                    x.setAttribute("aria-label", "Remove " + d.drug);
                    x.addEventListener("click", function () { draft.rx.splice(i, 1); paint(); });
                    row.appendChild(x);
                    return row;
                }));
            };
            const add = el("button", "enc-ghost", "Add drug");
            add.type = "button";
            add.addEventListener("click", function () {
                if (!drug.value.trim() || !dose.value.trim() || !dur.value.trim()) { err.textContent = "Enter the drug, dose and duration."; return; }
                err.textContent = "";
                draft.rx.push({ drug: drug.value.trim(), dose: dose.value.trim(), route: route.value, freq: freq.value, dur: dur.value.trim() });
                drug.value = dose.value = dur.value = "";
                paint();
                drug.focus();
            });
            const r1 = el("div", "enc-row"), r2 = el("div", "enc-row");
            r1.append(field("Dose", dose), field("Route", route));
            r2.append(field("Frequency", freq), field("Duration", dur));
            body.append(field("Drug", drug), r1, r2, add, el("p", "enc-sel-title", "To prescribe"), list);
            paint();
            send.addEventListener("click", function () {
                if (!draft.rx.length) { err.textContent = "Add at least one drug."; return; }
                try { save(function (r) { r.rx.unshift(Object.assign(stamp(), { items: draft.rx.slice() })); }); }
                catch (e) { err.textContent = "Could not save (storage unreadable or full)."; return; }
                draft.rx = [];
                renderOrders();
            });
        } else {
            const kind = tab;
            const search = el("div", "enc-search");
            const q = input("Search or type a test, then press Enter", 80);
            search.appendChild(q);
            const chips = el("div", "enc-chips");
            const sel = el("div", "enc-chips");
            const paint = function () {
                const term = q.value.trim().toLowerCase();
                chips.replaceChildren.apply(chips, CATALOG[kind].filter(function (n) { return !term || n.toLowerCase().indexOf(term) !== -1; }).map(function (n) {
                    const c = el("button", "enc-chip" + (draft[kind].indexOf(n) !== -1 ? " on" : ""), n);
                    c.type = "button";
                    c.setAttribute("aria-pressed", String(draft[kind].indexOf(n) !== -1));
                    c.addEventListener("click", function () { toggle(n); });
                    return c;
                }));
                sel.replaceChildren.apply(sel, draft[kind].map(function (n) {
                    const c = el("button", "enc-chip on", n + "  ×");
                    c.type = "button";
                    c.setAttribute("aria-label", "Remove " + n);
                    c.addEventListener("click", function () { toggle(n); });
                    return c;
                }));
            };
            const toggle = function (n) {
                const i = draft[kind].indexOf(n);
                if (i === -1) draft[kind].push(n); else draft[kind].splice(i, 1);
                paint();
            };
            q.addEventListener("input", paint);
            q.addEventListener("keydown", function (e) {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = q.value.trim();
                if (v && draft[kind].indexOf(v) === -1) draft[kind].push(v);
                q.value = "";
                paint();
            });
            const pri = select(["Routine", "Urgent"]);
            const info = input("Reason for request / clinical details", 200);
            const row = el("div", "enc-row");
            row.append(field("Priority", pri), field("Clinical details", info));
            body.append(search, chips, el("p", "enc-sel-title", "Selected"), sel, row);
            paint();
            send.addEventListener("click", function () {
                if (!draft[kind].length) { err.textContent = "Select at least one " + (kind === "lab" ? "test" : "investigation") + "."; return; }
                try { save(function (r) { r[kind].unshift(Object.assign(stamp(), { items: draft[kind].slice(), priority: pri.value, info: info.value.trim() })); }); }
                catch (e) { err.textContent = "Could not save (storage unreadable or full)."; return; }
                draft[kind] = [];
                renderOrders();
            });
        }

        const hist = el("div", "enc-req");
        hist.appendChild(el("div", "enc-sel-title", "Sent for this encounter"));
        if (!rec[tab].length) hist.appendChild(el("p", "enc-empty", "Nothing sent yet."));
        rec[tab].forEach(function (r) {
            const c = el("div", "enc-req-card");
            const lines = tab === "rx" ? r.items.map(function (d) { return d.drug + " · " + d.dose + " · " + d.route + " · " + d.freq + " · " + d.dur; }) : r.items;
            c.appendChild(el("div", "", lines.join("; ")));
            const sm = el("small", "", "Requested by " + r.by + " · " + when(r.at) + (r.info ? " · " + r.info : ""));
            if (r.priority === "Urgent") sm.prepend(el("span", "enc-urgent", "Urgent · "));
            c.appendChild(sm);
            hist.appendChild(c);
        });
        body.append(err, actions, hist);
        $("orderBody").replaceChildren(body);
    }

    renderBanner();
    renderNotes();
    renderOrders();
})();