// Ward bed data layer (localStorage for now — swap for API calls in Phase 2). Needs auth.js.
// Stored under "wardBeds" as { "male-ortho": { total, occupied }, ..., children: {...} }, keyed by unit id
// (or ward id for a ward without units, e.g. children). A ward with units reports the sum of its units.
// Reads throw on corrupt data so callers never overwrite it.
const WARD = (function () {
    const KEY = "wardBeds";
    const CHILD_MAX_AGE = 17; // patients under 18 are routed to the Children ward
    // PLACEHOLDER capacities, used until a unit/ward has its own stored figures. Change these to your real bed counts.
    const WARDS = [
        { id: "male", name: "Male Ward", units: [
            { id: "male-ortho", name: "Male Ortho", total: 6 },
            { id: "male-medical", name: "Male Medical", total: 6 },
            { id: "male-surgical", name: "Male Surgical", total: 5 },
            { id: "male-renal", name: "Male Renal", total: 3 }
        ] },
        { id: "female", name: "Female Ward", units: [
            { id: "female-ortho", name: "Female Ortho", total: 6 },
            { id: "female-medical", name: "Female Medical", total: 6 },
            { id: "female-surgical", name: "Female Surgical", total: 5 },
            { id: "female-renal", name: "Female Renal", total: 3 }
        ] },
        { id: "children", name: "Children Ward", total: 15 }
    ];

    function readStore() {
        const raw = JSON.parse(localStorage.getItem(KEY)) || {};
        if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Stored bed data is corrupted.");
        return raw;
    }
    function whole(n, fallback) { return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : fallback; }
    // Finds a ward or one of its units by id.
    function find(id) {
        for (let i = 0; i < WARDS.length; i++) {
            if (WARDS[i].id === id) return WARDS[i];
            const u = (WARDS[i].units || []).find(function (x) { return x.id === id; });
            if (u) return u;
        }
        return null;
    }

    function bedsFor(item, store) {
        const s = store[item.id];
        const total = whole(s && s.total, item.total);
        const occupied = Math.min(whole(s && s.occupied, 0), total);
        return { total: total, occupied: occupied, available: total - occupied };
    }

    // Returns { total, occupied, available } for a ward or unit id, or null if unknown.
    function getBeds(id) {
        const w = find(id);
        if (!w) return null;
        const store = readStore();
        if (!w.units) return bedsFor(w, store);
        let total = 0, occupied = 0;
        w.units.forEach(function (u) { const b = bedsFor(u, store); total += b.total; occupied += b.occupied; });
        return { total: total, occupied: occupied, available: total - occupied };
    }

    // Returns [{ id, name, total, occupied, available }] for a ward's units, or null if the ward has no units.
    function getUnits(id) {
        const w = WARDS.find(function (x) { return x.id === id; });
        if (!w || !w.units) return null;
        const store = readStore();
        return w.units.map(function (u) { return Object.assign({ id: u.id, name: u.name }, bedsFor(u, store)); });
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

    // Takes a unit id (or a ward id for a ward without units). Returns "" on success or an error message.
    // Nothing calls this from the UI yet; it is here for admissions.
    function setBeds(id, input) {
        if (!EMR_AUTH.getSession()) return "Your session has expired. Please log in again.";
        const target = find(id);
        if (!target || target.units) return "Select a valid ward.";
        const total = Number(input.total), occupied = Number(input.occupied);
        if (!Number.isInteger(total) || total < 0 || total > 9999) return "Total beds must be a whole number from 0 to 9999.";
        if (!Number.isInteger(occupied) || occupied < 0 || occupied > total) return "Occupied beds must be between 0 and the total.";
        const store = readStore();
        store[id] = { total: total, occupied: occupied };
        localStorage.setItem(KEY, JSON.stringify(store));
        return "";
    }

    return { WARDS: WARDS, CHILD_MAX_AGE: CHILD_MAX_AGE, getBeds: getBeds, getUnits: getUnits, wardFor: wardFor, setBeds: setBeds };
})();