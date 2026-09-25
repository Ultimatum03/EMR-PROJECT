// Shared data layer (localStorage for now — swap these functions for API calls in Phase 2).
// All reads throw on corrupt data so callers never overwrite it with an empty list.
const EMR = (function () {

    // Edit this list to change clinics. capacity = max visits per day; null = no cap.
    const CLINICS = [
        { id: "gopd", name: "General OPD", capacity: 40 },
        { id: "paed", name: "Paediatrics", capacity: 25 },
        { id: "anc", name: "Antenatal", capacity: 20 },
        { id: "dental", name: "Dental", capacity: 15 },
        { id: "eye", name: "Eye", capacity: 15 },
        { id: "emergency", name: "Emergency", capacity: null }
    ];

    // Allowed status changes. "scheduled" = booked appointment, not yet arrived.
    const NEXT_STATUS = {
        "scheduled": ["checked-in", "cancelled"],
        "checked-in": ["in-consultation"],
        "in-consultation": ["done"],
        "done": [],
        "cancelled": []
    };
    const STATUS_LABELS = {
        "scheduled": "Scheduled", "checked-in": "Waiting", "in-consultation": "With doctor",
        "done": "Done", "cancelled": "Cancelled"
    };

    function readList(key) {
        const list = JSON.parse(localStorage.getItem(key)) || [];
        if (!Array.isArray(list)) throw new Error("Stored " + key + " data is corrupted.");
        return list;
    }

    function pad(n) { return String(n).padStart(2, "0"); }
    function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
    function today() { return dateKey(new Date()); }
    function nowTime() { const d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }

    function newId(prefix) {
        const rand = window.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(16).slice(2, 10);
        return prefix + "-" + rand;
    }

    function clinic(id) { return CLINICS.find(function (c) { return c.id === id; }) || null; }

    function getPatients() { return readList("patients"); }
    function savePatients(list) { localStorage.setItem("patients", JSON.stringify(list)); }
    // Async-ready read used by the records table (skeleton shows while pending).
    // localStorage resolves at once; the Phase 2 API call will replace this body.
    function fetchPatients() {
        return new Promise(function (resolve) { resolve(getPatients()); });
    }
    function getPatient(id) { return getPatients().find(function (p) { return p.id === id; }) || null; }

    function getVisits() { return readList("visits"); }
    function saveVisits(list) { localStorage.setItem("visits", JSON.stringify(list)); }

    function byTime(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }

    function clinicLoad(clinicId, date) {
        return getVisits().filter(function (v) {
            return v.clinicId === clinicId && v.date === date && v.status !== "cancelled";
        }).length;
    }

    function isFull(clinicId, date) {
        const c = clinic(clinicId);
        return !!c && c.capacity !== null && clinicLoad(clinicId, date) >= c.capacity;
    }

    function clinicVisitsToday(clinicId) {
        return getVisits().filter(function (v) {
            return v.clinicId === clinicId && v.date === today() && v.status !== "cancelled";
        }).sort(byTime);
    }

    // "New" = no earlier (non-cancelled) visit by this patient to this clinic.
    function isNewToClinic(visit, visits) {
        return !(visits || getVisits()).some(function (v) {
            return v.id !== visit.id && v.patientId === visit.patientId && v.clinicId === visit.clinicId &&
                v.status !== "cancelled" && (v.date + v.time) < (visit.date + visit.time);
        });
    }

    // What the records table shows: today's visit, else next appointment, else last clinic.
    function patientClinicSummary(patientId, visits) {
        const mine = (visits || getVisits()).filter(function (v) {
            return v.patientId === patientId && v.status !== "cancelled";
        }).sort(byTime);
        const t = today();
        const todayVisit = mine.find(function (v) { return v.date === t && v.status !== "done"; });
        if (todayVisit) return { kind: "today", visit: todayVisit };
        const upcoming = mine.find(function (v) { return v.date > t && v.status === "scheduled"; });
        if (upcoming) return { kind: "upcoming", visit: upcoming };
        const past = mine.filter(function (v) { return v.date <= t && v.status !== "scheduled"; });
        if (past.length) return { kind: "last", visit: past[past.length - 1] };
        return null;
    }

    // Returns "" on success or an error message. Never partially writes.
    function addVisit(input) {
        const c = clinic(input.clinicId);
        if (!c) return "Select a valid clinic.";
        if (!getPatient(input.patientId)) return "Patient not found.";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < today()) return "Choose today or a future date.";
        if (!/^\d{2}:\d{2}$/.test(input.time)) return "Choose a valid time.";
        if (["appointment", "walk-in", "emergency"].indexOf(input.source) === -1) return "Invalid visit type.";
        if (isFull(c.id, input.date)) return c.name + " is full for " + input.date + ".";
        const visits = getVisits();
        const clash = visits.some(function (v) {
            return v.patientId === input.patientId && v.clinicId === c.id && v.date === input.date &&
                v.status !== "cancelled" && v.status !== "done";
        });
        if (clash) return "This patient already has an open visit at " + c.name + " on " + input.date + ".";
        visits.push({
            id: newId("VS"), patientId: input.patientId, clinicId: c.id, date: input.date, time: input.time,
            source: input.source, status: input.source === "appointment" ? "scheduled" : "checked-in",
            createdAt: new Date().toISOString()
        });
        saveVisits(visits);
        return "";
    }

    function setVisitStatus(visitId, status) {
        const visits = getVisits();
        const visit = visits.find(function (v) { return v.id === visitId; });
        if (!visit) return "Visit not found.";
        if ((NEXT_STATUS[visit.status] || []).indexOf(status) === -1) return "Cannot change status from " + visit.status + " to " + status + ".";
        if (status === "checked-in" && visit.date !== today()) return "Only today's appointments can be checked in.";
        visit.status = status;
        visit[status.replace(/-(\w)/g, function (m, ch) { return ch.toUpperCase(); }) + "At"] = new Date().toISOString();
        saveVisits(visits);
        return "";
    }

    // Photos are always re-encoded by us to JPEG; render nothing else (defends against tampered storage).
    function isSafePhoto(value) {
        return typeof value === "string" && value.length < 300000 &&
            /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
    }

    // Shared rendering helpers (textContent / attributes only — never innerHTML).
    function photoElement(patient, className) {
        if (patient && isSafePhoto(patient.photo)) {
            const img = document.createElement("img");
            img.className = className;
            img.src = patient.photo;
            img.alt = "Photo of " + patient.firstName + " " + patient.lastName;
            return img;
        }
        const placeholder = document.createElement("span");
        placeholder.className = className + " photo-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-user";
        placeholder.appendChild(icon);
        return placeholder;
    }

    function emergencyFlag() {
        const flag = document.createElement("span");
        flag.className = "emergency-flag";
        flag.title = "Emergency case";
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-flag";
        icon.setAttribute("aria-hidden", "true");
        flag.append(icon, document.createTextNode(" EMERGENCY"));
        return flag;
    }

    // Patient details (shared by registration's detail modal/expanded rows and the queue's View).
    const DETAIL_GROUPS = [
        ["Personal", [["Patient ID", "id"], ["First Name", "firstName"], ["Last Name", "lastName"],
            ["Other Name", "otherName"], ["Date of Birth", "dateOfBirth"], ["Gender", "gender"],
            ["Marital Status", "maritalStatus"]]],
        ["Medical", [["Blood Group", "bloodGroup"], ["Genotype", "genotype"]]],
        ["Contact", [["Phone", "phone"], ["Email", "email"], ["Address", "address"]]],
        ["Next of Kin", [["Name", "nextOfKin"], ["Relationship", "relationship"], ["Phone", "nextOfKinPhone"]]],
        ["Registration", [["Type", "patientType"], ["Registered", "registeredAt"]]]
    ];

    function fieldValue(patient, key) {
        const value = patient[key];
        if (key === "registeredAt" && value) {
            const d = new Date(value);
            return isNaN(d) ? "—" : d.toLocaleString();
        }
        return value || "—";
    }

    function renderDetailGroups(patient, container) {
        container.replaceChildren(photoElement(patient, "detail-photo"));
        const grid = document.createElement("div");
        grid.className = "detail-grid";
        DETAIL_GROUPS.forEach(function (group) {
            const section = document.createElement("section");
            const heading = document.createElement("h4");
            heading.textContent = group[0];
            const dl = document.createElement("dl");
            dl.className = "detail-list";
            group[1].forEach(function (field) {
                const dt = document.createElement("dt");
                dt.textContent = field[0];
                const dd = document.createElement("dd");
                dd.textContent = fieldValue(patient, field[1]);
                dl.append(dt, dd);
            });
            section.append(heading, dl);
            grid.appendChild(section);
        });
        container.appendChild(grid);
    }

    // "28 yrs (12 May 1998)" — empty string if DOB is missing/invalid.
    function ageAndDob(dob) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || "")) return "";
        const birth = new Date(dob + "T00:00:00");
        if (isNaN(birth)) return "";
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
        const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const pretty = birth.getDate() + " " + MONTHS[birth.getMonth()] + " " + birth.getFullYear();
        return (age < 1 ? "<1 yr" : age + (age === 1 ? " yr" : " yrs")) + " (" + pretty + ")";
    }

    return {
        renderDetailGroups: renderDetailGroups, ageAndDob: ageAndDob,
        isSafePhoto: isSafePhoto, photoElement: photoElement, emergencyFlag: emergencyFlag,
        CLINICS: CLINICS, NEXT_STATUS: NEXT_STATUS, STATUS_LABELS: STATUS_LABELS,
        today: today, nowTime: nowTime, dateKey: dateKey, newId: newId, clinic: clinic,
        getPatients: getPatients, fetchPatients: fetchPatients, savePatients: savePatients, getPatient: getPatient,
        getVisits: getVisits, clinicLoad: clinicLoad, isFull: isFull, clinicVisitsToday: clinicVisitsToday,
        isNewToClinic: isNewToClinic, patientClinicSummary: patientClinicSummary,
        addVisit: addVisit, setVisitStatus: setVisitStatus
    };
})();
