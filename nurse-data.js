// Nurse data layer (localStorage for now — swap for API calls in Phase 2). Needs emr-data.js and auth.js.
// Vitals are append-only (a correction is a new entry) and live apart from visits, so the shared
// status flow is untouched. Reads throw on corrupt data so callers never overwrite it.
const NURSE = (function () {
    const KEY = "vitals";
    const NOTE_MAX = 500;
    // Bounds only catch typos. They are NOT clinical normal ranges (those differ by age).
    const FIELDS = [
        { key: "temp", label: "Temperature", unit: "°C", min: 30, max: 45 },
        { key: "pulse", label: "Pulse", unit: "bpm", min: 20, max: 250 },
        { key: "resp", label: "Respiratory rate", unit: "/min", min: 4, max: 80 },
        { key: "sys", label: "BP systolic", unit: "mmHg", min: 50, max: 300 },
        { key: "dia", label: "BP diastolic", unit: "mmHg", min: 20, max: 200 },
        { key: "spo2", label: "SpO2", unit: "%", min: 50, max: 100 },
        { key: "weight", label: "Weight", unit: "kg", min: 0.3, max: 500 }
    ];
    const NUMBER = /^\d{1,3}(\.\d{1,2})?$/;

    function getVitals() {
        const list = JSON.parse(localStorage.getItem(KEY)) || [];
        if (!Array.isArray(list)) throw new Error("Stored vitals data is corrupted.");
        return list;
    }

    function latestForVisit(visitId, list) {
        const mine = (list || getVitals()).filter(function (v) { return v && v.visitId === visitId; });
        return mine.length ? mine[mine.length - 1] : null;
    }

    // Returns "" on success or an error message. Never partially writes.
    function addVitals(visitId, input) {
        const session = EMR_AUTH.getSession();
        if (!session) return "Your session has expired. Please log in again.";
        const visit = EMR.getVisits().find(function (v) { return v.id === visitId; });
        if (!visit) return "Visit not found.";
        if (visit.date !== EMR.today() || visit.status !== "checked-in") return "This patient is no longer waiting.";

        const rec = {};
        for (let i = 0; i < FIELDS.length; i++) {
            const f = FIELDS[i];
            const raw = String(input[f.key] == null ? "" : input[f.key]).trim();
            if (!raw) continue;
            if (!NUMBER.test(raw)) return f.label + " must be a number.";
            const n = Number(raw);
            if (n < f.min || n > f.max) return f.label + " must be between " + f.min + " and " + f.max + " " + f.unit + ".";
            rec[f.key] = n;
        }
        if (!Object.keys(rec).length) return "Enter at least one measurement.";
        if ((rec.sys === undefined) !== (rec.dia === undefined)) return "Enter both systolic and diastolic blood pressure.";
        if (rec.sys !== undefined && rec.sys <= rec.dia) return "Systolic pressure must be higher than diastolic.";
        const note = String(input.note == null ? "" : input.note).trim();
        if (note.length > NOTE_MAX) return "Note must be " + NOTE_MAX + " characters or fewer.";
        if (note) rec.note = note;

        const list = getVitals();
        list.push(Object.assign({
            id: EMR.newId("VT"), visitId: visit.id, patientId: visit.patientId,
            recordedBy: session.username, recordedAt: new Date().toISOString()
        }, rec));
        localStorage.setItem(KEY, JSON.stringify(list));
        return "";
    }

    return { FIELDS: FIELDS, NOTE_MAX: NOTE_MAX, getVitals: getVitals, latestForVisit: latestForVisit, addVitals: addVitals };
})();