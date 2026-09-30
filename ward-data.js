// Ward bed data layer (localStorage for now — swap for API calls in Phase 2). Needs auth.js.
// Stored under "wardBeds" as { male: { total, occupied }, female: {...}, children: {...} }.
// Reads throw on corrupt data so callers never overwrite it.
const WARD = (function () {
    const KEY = "wardBeds";
    const CHILD_MAX_AGE = 17; // patients under 18 are routed to the Children ward
    // PLACEHOLDER capacities, used until a ward has its own stored figures. Change these to your real bed counts.
    const WARDS = [
        { id: "male", name: "Male Ward", total: 20 },
        { id: "female", name: "Female Ward", total: 20 },
        { id: "children", name: "Children Ward", total: 15 }
    ];

    function readStore() {
        const raw = JSON.parse(localStorage.getItem(KEY)) || {};
        if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Stored bed data is corrupted.");
        return raw;
    }
    function whole(n, fallback) { return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : fallback; }
    function find(id) { return WARDS.find(function (w) { return w.id === id; }) || null; }

    // Returns { total, occupied, available } for a ward id, or null for an unknown ward.
    function getBeds(id) {
        const w = find(id);
        if (!w) return null;
        const s = readStore()[id];
        const total = whole(s && s.total, w.total);
        const occupied = Math.min(whole(s && s.occupied, 0), total);
        return { total: total, occupied: occupied, available: total - occupied };
    }

    // Which ward a patient belongs in: "male" | "female" | "children" | null (unknown).
    function wardFor(patient) {
        if (!patient) return null;
        const dob = new Date(patient.dateOfBirth);
        if (!isNaN(dob)) {
            const now = new Date();
            let age = now.getFullYear() - dob.getFullYear();
            if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
            if (age >= 0 && age <= CHILD_MAX_AGE) return "children";
        }
        const g = String(patient.gender == null ? "" : patient.gender).trim().toLowerCase();
        if (g === "male" || g === "m") return "male";
        if (g === "female" || g === "f") return "female";
        return null;
    }

    // Returns "" on success or an error message. Nothing calls this from the UI yet; it is here for admissions.
    function setBeds(id, input) {
        if (!EMR_AUTH.getSession()) return "Your session has expired. Please log in again.";
        if (!find(id)) return "Select a valid ward.";
        const total = Number(input.total), occupied = Number(input.occupied);
        if (!Number.isInteger(total) || total < 0 || total > 9999) return "Total beds must be a whole number from 0 to 9999.";
        if (!Number.isInteger(occupied) || occupied < 0 || occupied > total) return "Occupied beds must be between 0 and the total.";
        const store = readStore();
        store[id] = { total: total, occupied: occupied };
        localStorage.setItem(KEY, JSON.stringify(store));
        return "";
    }

    return { WARDS: WARDS, CHILD_MAX_AGE: CHILD_MAX_AGE, getBeds: getBeds, wardFor: wardFor, setBeds: setBeds };
})();