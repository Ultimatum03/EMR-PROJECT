// Clinic data layer (localStorage for now — swap for API calls in Phase 2). Needs emr-data.js and auth.js.
// Doctors: { id, name, specialty, clinicId, days: [0-6, Sun=0], addedBy, addedAt }.
// Reads throw on corrupt data so callers never overwrite it.
const CLINIC = (function () {
    const KEY = "doctors";
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const EXPIRED = "Your session has expired. Please log in again.";

    function getDoctors() {
        const list = JSON.parse(localStorage.getItem(KEY)) || [];
        if (!Array.isArray(list)) throw new Error("Stored doctors data is corrupted.");
        return list;
    }
    function isDoctor(d) {
        return !!d && typeof d.id === "string" && typeof d.name === "string" && typeof d.clinicId === "string" && Array.isArray(d.days);
    }
    function forClinic(clinicId, list) {
        return (list || getDoctors()).filter(function (d) { return isDoctor(d) && d.clinicId === clinicId; })
            .sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    function onDuty(doctor, dayIndex) { return doctor.days.indexOf(dayIndex) !== -1; }

    // Returns "" on success or an error message. Never partially writes.
    function addDoctor(input) {
        const session = EMR_AUTH.getSession();
        if (!session) return EXPIRED;
        const name = String(input.name == null ? "" : input.name).trim();
        const specialty = String(input.specialty == null ? "" : input.specialty).trim();
        if (name.length < 2 || name.length > 80) return "Enter the doctor's name (2–80 characters).";
        if (specialty.length > 60) return "Specialty must be 60 characters or fewer.";
        if (!EMR.clinic(input.clinicId)) return "Select a valid clinic.";
        const days = Array.isArray(input.days) ? input.days : [];
        if (!days.length || days.some(function (d) { return !Number.isInteger(d) || d < 0 || d > 6; })) return "Select at least one working day.";
        const list = getDoctors();
        const dup = list.some(function (d) {
            return isDoctor(d) && d.clinicId === input.clinicId && d.name.toLowerCase() === name.toLowerCase();
        });
        if (dup) return "This doctor is already listed for that clinic.";
        list.push({
            id: EMR.newId("DR"), name: name, specialty: specialty, clinicId: input.clinicId,
            days: days.filter(function (d, i) { return days.indexOf(d) === i; }).sort(function (a, b) { return a - b; }),
            addedBy: session.username, addedAt: new Date().toISOString()
        });
        localStorage.setItem(KEY, JSON.stringify(list));
        return "";
    }

    function removeDoctor(id) {
        if (!EMR_AUTH.getSession()) return EXPIRED;
        const list = getDoctors();
        const next = list.filter(function (d) { return !(d && d.id === id); });
        if (next.length === list.length) return "Doctor not found.";
        localStorage.setItem(KEY, JSON.stringify(next));
        return "";
    }

    // Moves today's scheduled or waiting visit to another clinic. emr-data.js has no save function for
    // visits, so this writes the "visits" key directly and repeats addVisit's capacity and clash rules.
    function transferVisit(visitId, toClinicId) {
        const session = EMR_AUTH.getSession();
        if (!session) return EXPIRED;
        const to = EMR.clinic(toClinicId);
        if (!to) return "Select a valid clinic.";
        const visits = EMR.getVisits();
        const v = visits.find(function (x) { return x.id === visitId; });
        if (!v) return "Visit not found.";
        if (v.clinicId === to.id) return "The patient is already in that clinic.";
        if (v.date !== EMR.today() || (v.status !== "scheduled" && v.status !== "checked-in")) return "Only today's scheduled or waiting patients can be transferred.";
        if (EMR.isFull(to.id, v.date)) return to.name + " is full for " + v.date + ".";
        const clash = visits.some(function (x) {
            return x.id !== v.id && x.patientId === v.patientId && x.clinicId === to.id && x.date === v.date &&
                x.status !== "cancelled" && x.status !== "done";
        });
        if (clash) return "This patient already has an open visit at " + to.name + " today.";
        v.transferredFrom = v.clinicId;
        v.clinicId = to.id;
        v.transferredAt = new Date().toISOString();
        v.transferredBy = session.username;
        localStorage.setItem("visits", JSON.stringify(visits));
        return "";
    }

    return {
        DAY_NAMES: DAY_NAMES, getDoctors: getDoctors, forClinic: forClinic, onDuty: onDuty,
        addDoctor: addDoctor, removeDoctor: removeDoctor, transferVisit: transferVisit
    };
})();