const patientForm = document.getElementById("patientForm");

const registrationForm = document.getElementById("registrationForm");
const emergencyRegistration = document.getElementById("emergencyRegistration");
const patientRecords = document.getElementById("patientRecords");
const registrationTitle = document.getElementById("registrationTitle");
const registrationSubtitle = document.getElementById("registrationSubtitle");

const patientTableBody = document.getElementById("patientTableBody");
const statusFilter = document.getElementById("statusFilter");

let isEmergencyRegistration = false;

const patientSearch = document.getElementById("patientSearch");
const searchForm = document.getElementById("searchForm");
const searchStatus = document.getElementById("searchStatus");
const searchResults = document.getElementById("searchResults");
const patientDetail = document.getElementById("patientDetail");
const patientDetailList = document.getElementById("patientDetailList");

let searchIsEmergency = false;


// STORAGE — throws on corrupt data so callers never overwrite it with []

function getStoredPatients() {
    return EMR.getPatients();
}

// Form fields saved on a patient record (shared by register + edit).
const FORM_FIELDS = ["firstName", "lastName", "otherName", "dateOfBirth", "gender", "maritalStatus",
    "phone", "email", "address", "bloodGroup", "genotype", "nextOfKin", "relationship", "nextOfKinPhone"];

let editingPatientId = null;
let currentPhoto = "";


// SEARCH FOR EXISTING PATIENT (Phase 3)

function showPatientSearch(isEmergency = false) {
    closeEmergencyRegistration();
    searchIsEmergency = isEmergency;
    document.getElementById("patientSearchTitle").textContent =
        isEmergency ? "Emergency: Search for Existing Patient" : "Search for Existing Patient";
    searchForm.reset();
    setSearchStatus("");
    searchResults.replaceChildren();
    patientSearch.classList.remove("hidden");
    document.body.classList.add("modal-open");
    document.getElementById("searchFirstName").focus();
}

function closePatientSearch() {
    patientSearch.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function handleSearchBackdropClick(event) {
    if (event.target === patientSearch) closePatientSearch();
}

function setSearchStatus(message, isError = false) {
    searchStatus.textContent = message;
    searchStatus.classList.toggle("error", isError);
}

function normalise(value) {
    return String(value || "").trim().toLowerCase();
}

function localDateKey(d) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")].join("-");
}

function todayLocal() {
    return localDateKey(new Date());
}

// UX validation only — the server must re-validate once the API exists (Phase 2).
function validateSearch(c) {
    if (!c.firstName || !c.lastName || !c.dateOfBirth) return "First name, last name and date of birth are all required.";
    if (c.firstName.length > 100 || c.lastName.length > 100) return "Names must be 100 characters or fewer.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth) || isNaN(Date.parse(c.dateOfBirth))) return "Enter a valid date of birth.";
    if (c.dateOfBirth > todayLocal()) return "Date of birth cannot be in the future.";
    return "";
}

// Exact, case-insensitive name match + exact DOB.
function findExistingPatients(c) {
    return getStoredPatients().filter(function(p) {
        return normalise(p.firstName) === normalise(c.firstName) &&
            normalise(p.lastName) === normalise(c.lastName) &&
            p.dateOfBirth === c.dateOfBirth;
    });
}

searchForm.addEventListener("submit", function(event) {
    event.preventDefault();
    searchResults.replaceChildren();

    const criteria = {
        firstName: document.getElementById("searchFirstName").value.trim(),
        lastName: document.getElementById("searchLastName").value.trim(),
        dateOfBirth: document.getElementById("searchDob").value
    };

    const error = validateSearch(criteria);
    if (error) return setSearchStatus(error, true);

    setSearchStatus("Searching…");
    let matches;
    try {
        matches = findExistingPatients(criteria);
    } catch (err) {
        return setSearchStatus("Could not read patient records. Registration is blocked until this is resolved.", true);
    }

    if (matches.length) renderMatches(matches);
    else renderNoMatch(criteria);
});


// BRANCH: RECORD FOUND (Phase 4)

function renderMatches(matches) {
    setSearchStatus(matches.length + " existing record" + (matches.length > 1 ? "s" : "") + " found.");

    matches.forEach(function(patient) {
        const card = document.createElement("div");
        card.className = "match-card";

        const info = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = patient.firstName + " " + patient.lastName;
        const meta = document.createElement("span");
        meta.textContent = "DOB: " + patient.dateOfBirth + " · ID: " + patient.id;
        info.append(name, meta);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "primary-btn";
        btn.textContent = "Continue with this patient";
        btn.addEventListener("click", function() {
            closePatientSearch();
            showPatientDetail(patient.id);
        });

        card.append(info, btn);
        searchResults.appendChild(card);
    });
}


// BRANCH: NO RECORD FOUND (Phase 5)

function renderNoMatch(criteria) {
    setSearchStatus("No existing patient matches these details.");

    const wrap = document.createElement("div");
    wrap.className = "no-match-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "primary-btn";
    btn.textContent = "New Registration";
    btn.addEventListener("click", function() {
        const isEmergency = searchIsEmergency;
        closePatientSearch();
        patientForm.reset(); // don't carry over a previously abandoned form
        showRegistrationForm(isEmergency);
        document.getElementById("firstName").value = criteria.firstName;
        document.getElementById("lastName").value = criteria.lastName;
        document.getElementById("dateOfBirth").value = criteria.dateOfBirth;
    });
    wrap.appendChild(btn);
    searchResults.appendChild(wrap);
}


// READ-ONLY PATIENT DETAIL

// Detail renderer is shared with the queue page (emr-data.js).
const renderDetailGroups = EMR.renderDetailGroups;

// textContent only — stored values are never parsed as HTML.
const photoElement = EMR.photoElement;

function actionButton(label, className, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", function(event) {
        event.stopPropagation(); // never toggles the table row underneath
        onClick();
    });
    return btn;
}

// Icon-only variant: accessible name via aria-label, tooltip via title.
function iconActionButton(label, iconClass, className, onClick) {
    const btn = actionButton("", className + " icon-action-btn", onClick);
    btn.setAttribute("aria-label", label);
    btn.title = label;
    const i = document.createElement("i");
    i.className = iconClass;
    i.setAttribute("aria-hidden", "true");
    btn.appendChild(i);
    return btn;
}

function renderPatientActions(patient, container) {
    container.replaceChildren(
        actionButton("Edit", "secondary-btn", function() { showEditForm(patient.id); }),
        actionButton("Send to Clinic", "primary-btn", function() { openVisitModal(patient.id, "transfer"); }),
        actionButton("Book Appointment", "secondary-btn", function() { openVisitModal(patient.id, "book"); })
    );
}

function showPatientDetail(patientID) {
    let patient;
    try {
        patient = getStoredPatients().find(function(item) { return item.id === patientID; });
    } catch (err) {
        alert("Could not read patient records.");
        return;
    }
    if (!patient) {
        alert("Patient not found.");
        return;
    }

    renderDetailGroups(patient, patientDetailList);
    renderPatientActions(patient, document.getElementById("patientDetailActions"));

    patientDetail.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closePatientDetail() {
    patientDetail.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function handleDetailBackdropClick(event) {
    if (event.target === patientDetail) closePatientDetail();
}


// SHOW REGISTRATION FORM

function showRegistrationForm(isEmergency = false) {

    isEmergencyRegistration = isEmergency;

    if (isEmergencyRegistration) {
        registrationTitle.textContent = "Emergency Patient Registration";
        registrationSubtitle.textContent = "Register the identified emergency patient and tag the record as emergency.";
    } else {
        registrationTitle.textContent = "New Patient Registration";
        registrationSubtitle.textContent = "Enter the patient's information below";
    }

    registrationForm.classList.remove("hidden");

    document.body.classList.add("modal-open");

    document.getElementById("firstName").focus();

}


// CLOSE REGISTRATION FORM

function closeRegistrationForm() {

    registrationForm.classList.add("hidden");
    isEmergencyRegistration = false;
    editingPatientId = null;
    stopCamera();
    registrationTitle.textContent = "New Patient Registration";
    registrationSubtitle.textContent = "Enter the patient's information below";
    document.getElementById("patientSubmitBtn").textContent = "Register Patient";
    document.body.classList.remove("modal-open");

}

function showEditForm(patientID) {
    let patient;
    try {
        patient = EMR.getPatient(patientID);
    } catch (err) {
        alert("Could not read patient records.");
        return;
    }
    if (!patient) return alert("Patient not found.");

    closePatientDetail();
    patientForm.reset();
    FORM_FIELDS.forEach(function(field) {
        document.getElementById(field).value = patient[field] || "";
    });
    setPhoto(EMR.isSafePhoto(patient.photo) ? patient.photo : "");
    showRegistrationForm(patient.patientType === "Emergency");
    editingPatientId = patient.id;
    registrationTitle.textContent = "Edit Patient";
    registrationSubtitle.textContent = patient.id + " — registration type and ID can't be changed here.";
    document.getElementById("patientSubmitBtn").textContent = "Save Changes";
}

function showEmergencyRegistration() {
    emergencyRegistration.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeEmergencyRegistration() {
    emergencyRegistration.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function handleEmergencyBackdropClick(event) {
    if (event.target === emergencyRegistration) {
        closeEmergencyRegistration();
    }
}


function handleRegistrationBackdropClick(event) {

    if (event.target === registrationForm) {

        closeRegistrationForm();

    }

}


// SHOW PATIENT RECORDS

function showPatients() {

    patientRecords.classList.remove("hidden");

    registrationForm.classList.add("hidden");

    document.body.classList.remove("modal-open");

    loadPatients();

}

// Sidebar "Patient Records" links to #records on this page.
function syncRecordsView() {
    const onRecords = location.hash === "#records";
    const title = onRecords ? "Patient Records" : "Patient Registration";
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageSubtitle").textContent =
        onRecords ? "Browse and manage registered patients" : "Register and manage hospital patients";
    document.title = title + " | EMR";

    // KPI cards and their lists belong to the Register view only.
    document.getElementById("kpiSection").classList.toggle("hidden", onRecords);
    if (onRecords) setActiveKpi(null);

    if (onRecords) showPatients();
    else patientRecords.classList.add("hidden");
    // Active sidebar item is handled by sidebar.js.
}

window.addEventListener("hashchange", syncRecordsView);


// KPI CARDS

function updateKpis() {
    const registered = document.getElementById("kpiRegisteredToday");
    const emergency = document.getElementById("kpiEmergencyToday");
    const appointments = document.getElementById("kpiAppointments");
    let today, appts;
    try {
        const key = todayLocal();
        today = getStoredPatients().filter(function(p) {
            return p.registeredAt && localDateKey(new Date(p.registeredAt)) === key;
        });
        appts = EMR.getVisits().filter(function(v) {
            return v.date === key && v.source === "appointment" && v.status !== "cancelled";
        });
    } catch (err) {
        registered.textContent = emergency.textContent = appointments.textContent = "—";
        renderKpiPanel();
        return;
    }
    registered.textContent = today.length;
    emergency.textContent = today.filter(function(p) { return p.patientType === "Emergency"; }).length;
    appointments.textContent = appts.length;
    renderKpiPanel(); // keep an open KPI list in step with the counts
}

// Keep this page in sync when another tab (e.g. the queue) changes data.
window.addEventListener("storage", function(event) {
    if (event.key !== "patients" && event.key !== "visits") return;
    updateKpis();
    if (!patientRecords.classList.contains("hidden")) loadPatients();
});


// REGISTER PATIENT

patientForm.addEventListener("submit", function(event) {

    event.preventDefault();

    let patients;
    try {
        patients = getStoredPatients();
    } catch (err) {
        return alert("Could not read patient records. Nothing was saved.");
    }

    const values = {};
    FORM_FIELDS.forEach(function(field) {
        values[field] = document.getElementById(field).value;
    });
    values.photo = currentPhoto;

    let patient;
    if (editingPatientId) {
        patient = patients.find(function(p) { return p.id === editingPatientId; });
        if (!patient) return alert("This patient no longer exists. Nothing was saved.");
        const clash = patients.find(function(p) {
            return p.id !== patient.id && p.dateOfBirth === values.dateOfBirth &&
                normalise(p.firstName) === normalise(values.firstName) &&
                normalise(p.lastName) === normalise(values.lastName);
        });
        if (clash && !confirm("Another patient (" + clash.id + ") has the same name and date of birth. Save anyway?")) return;
        Object.assign(patient, values, { updatedAt: new Date().toISOString() }); // id, type, registeredAt unchanged
    } else {
        patient = Object.assign({
            id: generatePatientID(),
            isEmergency: isEmergencyRegistration,
            patientType: isEmergencyRegistration ? "Emergency" : "Routine",
            registeredAt: new Date().toISOString()
        }, values);
        patients.push(patient);
    }

    try {
        EMR.savePatients(patients);
    } catch (err) {
        // Most likely QuotaExceededError — keep the form open so nothing typed is lost.
        return alert("Could not save: browser storage is full. Try removing the photo, then save again.");
    }

    const wasNew = !editingPatientId;
    closeRegistrationForm();
    patientForm.reset();
    setPhoto("");
    updateKpis();
    if (!patientRecords.classList.contains("hidden")) loadPatients();

    // After a new registration, go straight to choosing a clinic.
    if (wasNew) openVisitModal(patient.id, "transfer", "Registered " + patient.id + ". ");

});


// PATIENT PHOTO — always re-encoded to a 256px JPEG (drops metadata such as GPS).

const photoPreview = document.getElementById("photoPreview");
const photoError = document.getElementById("photoError");
const cameraPanel = document.getElementById("cameraPanel");
const cameraVideo = document.getElementById("cameraVideo");
let cameraStream = null;

function setPhoto(dataUrl) {
    currentPhoto = dataUrl;
    photoError.textContent = "";
    photoPreview.replaceChildren(photoElement(dataUrl ? { photo: dataUrl, firstName: "patient", lastName: "" } : null, "photo-img"));
    document.getElementById("removePhotoBtn").classList.toggle("hidden", !dataUrl);
}

function toJpeg(source, width, height) {
    const scale = Math.min(1, 256 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
}

document.getElementById("photoInput").addEventListener("change", function() {
    const file = this.files[0];
    this.value = ""; // allow picking the same file again
    if (!file) return;
    if (["image/jpeg", "image/png"].indexOf(file.type) === -1) return (photoError.textContent = "Only JPEG or PNG images are allowed.");
    if (file.size > 5 * 1024 * 1024) return (photoError.textContent = "Image must be 5 MB or smaller.");

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function() {
        setPhoto(toJpeg(img, img.naturalWidth, img.naturalHeight));
        URL.revokeObjectURL(url);
    };
    img.onerror = function() {
        photoError.textContent = "That file could not be read as an image.";
        URL.revokeObjectURL(url);
    };
    img.src = url;
});

document.getElementById("removePhotoBtn").addEventListener("click", function() { setPhoto(""); });

document.getElementById("cameraBtn").addEventListener("click", function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        photoError.textContent = "Camera is not available in this browser.";
        return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function(stream) {
        cameraStream = stream;
        cameraVideo.srcObject = stream;
        cameraPanel.classList.remove("hidden");
    }).catch(function() {
        photoError.textContent = "Could not open the camera (permission denied or no camera found).";
    });
});

function stopCamera() {
    if (cameraStream) cameraStream.getTracks().forEach(function(track) { track.stop(); });
    cameraStream = null;
    cameraVideo.srcObject = null;
    cameraPanel.classList.add("hidden");
}

document.getElementById("cameraCancelBtn").addEventListener("click", stopCamera);

document.getElementById("cameraCaptureBtn").addEventListener("click", function() {
    if (!cameraVideo.videoWidth) return (photoError.textContent = "Camera is not ready yet.");
    setPhoto(toJpeg(cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight));
    stopCamera();
});

// Clear the photo whenever the form's Clear button is used.
patientForm.addEventListener("reset", function() { setPhoto(""); stopCamera(); });


// SEND TO CLINIC / BOOK APPOINTMENT

const visitModal = document.getElementById("visitModal");
const visitClinic = document.getElementById("visitClinic");
const visitDate = document.getElementById("visitDate");
const visitTime = document.getElementById("visitTime");
const visitError = document.getElementById("visitError");
let visitContext = null;

function fillClinicOptions(date, preferred) {
    const selected = preferred || visitClinic.value;
    visitClinic.replaceChildren();
    let loads;
    try {
        loads = EMR.CLINICS.map(function(c) { return EMR.clinicLoad(c.id, date); });
    } catch (err) {
        visitError.textContent = "Could not read visit records.";
        return;
    }
    EMR.CLINICS.forEach(function(c, i) {
        const full = c.capacity !== null && loads[i] >= c.capacity;
        const option = document.createElement("option");
        option.value = c.id;
        option.disabled = full;
        option.textContent = c.name + " — " + loads[i] + (c.capacity === null ? " (no cap)" : " / " + c.capacity) + (full ? " — FULL" : "");
        visitClinic.appendChild(option);
    });
    const keep = Array.prototype.find.call(visitClinic.options, function(o) { return o.value === selected && !o.disabled; }) ||
        Array.prototype.find.call(visitClinic.options, function(o) { return !o.disabled; });
    if (keep) visitClinic.value = keep.value;
}

function openVisitModal(patientID, mode, note) {
    let patient;
    try {
        patient = EMR.getPatient(patientID);
    } catch (err) {
        return alert("Could not read patient records.");
    }
    if (!patient) return alert("Patient not found.");

    closePatientDetail();
    const booking = mode === "book";
    const emergency = patient.patientType === "Emergency";
    visitContext = { patientId: patient.id, mode: mode, source: booking ? "appointment" : (emergency ? "emergency" : "walk-in") };

    document.getElementById("visitTitle").textContent = booking ? "Book Appointment" : "Send to Clinic";
    document.getElementById("visitPatient").textContent =
        (note || "") + patient.firstName + " " + patient.lastName + " · " + patient.id;
    document.getElementById("visitSubmitBtn").textContent = booking ? "Book" : "Send to Clinic";
    document.getElementById("visitCancelBtn").textContent = booking ? "Cancel" : "Skip";
    document.querySelectorAll(".visit-booking-field").forEach(function(f) { f.classList.toggle("hidden", !booking); });

    visitError.textContent = "";
    visitDate.min = EMR.today();
    visitDate.value = EMR.today();
    visitTime.value = "";
    fillClinicOptions(EMR.today(), emergency && !booking ? "emergency" : "");

    visitModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
}

function closeVisitModal() {
    visitModal.classList.add("hidden");
    visitContext = null;
    document.body.classList.remove("modal-open");
}

function handleVisitBackdropClick(event) {
    if (event.target === visitModal) closeVisitModal();
}

visitDate.addEventListener("change", function() { fillClinicOptions(visitDate.value); });

document.getElementById("visitForm").addEventListener("submit", function(event) {
    event.preventDefault();
    if (!visitContext) return;
    const booking = visitContext.mode === "book";
    let error;
    try {
        error = EMR.addVisit({
            patientId: visitContext.patientId,
            clinicId: visitClinic.value,
            date: booking ? visitDate.value : EMR.today(),
            time: booking ? visitTime.value : EMR.nowTime(),
            source: visitContext.source
        });
    } catch (err) {
        error = "Could not save the visit (storage unreadable or full).";
    }
    if (error) return (visitError.textContent = error);
    closeVisitModal();
    updateKpis();
    if (!patientRecords.classList.contains("hidden")) loadPatients();
});


document.addEventListener("keydown", function(event) {

    if (event.key !== "Escape") {
        return;
    }

    if (!unidentifiedModal.classList.contains("hidden")) {
        closeUnidentifiedForm();
    } else if (!visitModal.classList.contains("hidden")) {
        closeVisitModal();
    } else if (!patientDetail.classList.contains("hidden")) {
        closePatientDetail();
    } else if (!patientSearch.classList.contains("hidden")) {
        closePatientSearch();
    } else if (!registrationForm.classList.contains("hidden")) {
        closeRegistrationForm();
    } else if (!emergencyRegistration.classList.contains("hidden")) {
        closeEmergencyRegistration();
    }

});


// GENERATE PATIENT ID

function generatePatientID() {

    const number =
        Math.floor(100000 + Math.random() * 900000);

    return "PT-" + number;

}


// LOAD PATIENTS

function getFilteredPatients(patients) {

    const search =
        document.getElementById("searchPatient").value.toLowerCase();

    const selectedStatus =
        statusFilter ? statusFilter.value : "All";


    return patients.filter(function(patient) {

        const matchesSearch =
            !search ||
            (patient.id && patient.id.toLowerCase().includes(search)) ||
            (patient.firstName && patient.firstName.toLowerCase().includes(search)) ||
            (patient.lastName && patient.lastName.toLowerCase().includes(search)) ||
            (patient.phone && patient.phone.toLowerCase().includes(search));

        const matchesStatus =
            selectedStatus === "All" ||
            (patient.patientType || "Routine") === selectedStatus;

        return matchesSearch && matchesStatus;

    });

}

let loadSeq = 0;

function loadPatients() {
    const seq = ++loadSeq;
    showTableSkeleton();
    EMR.fetchPatients().then(function(patients) {
        if (seq !== loadSeq) return; // a newer load started (e.g. fast typing) — drop this result
        patientTableBody.removeAttribute("aria-busy");
        const filtered = getFilteredPatients(patients);
        const hasQuery = document.getElementById("searchPatient").value.trim() !== "";
        // A search that narrows to exactly one record opens it expanded.
        displayPatients(filtered, hasQuery && filtered.length === 1, patients.length);
    }, function() {
        if (seq !== loadSeq) return;
        patientTableBody.removeAttribute("aria-busy");
        patientTableBody.replaceChildren(stateRow("fa-solid fa-triangle-exclamation", "Could not read patient records.", ""));
    });
}

// Grey placeholder rows while records load.
function showTableSkeleton() {
    patientTableBody.setAttribute("aria-busy", "true");
    const rows = [];
    for (let r = 0; r < 5; r++) {
        const tr = document.createElement("tr");
        tr.className = "skeleton-row";
        for (let c = 0; c < 7; c++) {
            const td = document.createElement("td");
            const bar = document.createElement("span");
            bar.className = "skeleton-bar";
            td.appendChild(bar);
            tr.appendChild(td);
        }
        rows.push(tr);
    }
    patientTableBody.replaceChildren.apply(patientTableBody, rows);
}

function stateRow(iconClass, title, text) {
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "empty-state";
    const icon = document.createElement("i");
    icon.className = iconClass + " empty-state-icon";
    icon.setAttribute("aria-hidden", "true");
    const strong = document.createElement("strong");
    strong.textContent = title;
    td.append(icon, strong);
    if (text) {
        const p = document.createElement("span");
        p.textContent = text;
        td.appendChild(p);
    }
    const tr = document.createElement("tr");
    tr.appendChild(td);
    return tr;
}


// SEARCH PATIENTS

document
    .getElementById("searchPatient")
    .addEventListener("input", function() {

        loadPatients();

    });

if (statusFilter) {
    statusFilter.addEventListener("change", function() {
        loadPatients();
    });
}


// DISPLAY PATIENTS

function displayPatients(patients, expandFirst = false, totalCount = patients.length) {

    patientTableBody.innerHTML = "";


    if (patients.length === 0) {
        patientTableBody.replaceChildren(totalCount === 0
            ? stateRow("fa-solid fa-user-plus", "No patients registered yet", "Use the New Patient button at the top right to register the first patient.")
            : stateRow("fa-solid fa-magnifying-glass", "No matching patients", "Try a different name, patient ID or phone number, or clear the filter."));
        return;
    }


    let visits = null;
    try {
        visits = EMR.getVisits();
    } catch (err) {
        visits = null; // clinic column shows an error instead of wrong data
    }

    // Built with textContent — stored values are never parsed as HTML.
    patients.forEach(function(patient, index) {

        const row = patientRow(patient, clinicCell(patient, visits));

        const detailId = "detail-" + index;

        const actionCell = document.createElement("td");
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "secondary-btn expand-btn";
        toggleBtn.setAttribute("aria-controls", detailId);
        actionCell.appendChild(toggleBtn);
        row.appendChild(actionCell);

        const detailRow = document.createElement("tr");
        detailRow.id = detailId;
        detailRow.className = "detail-row";
        const detailCell = document.createElement("td");
        detailCell.colSpan = 7;
        renderDetailGroups(patient, detailCell);
        const rowActions = document.createElement("div");
        rowActions.className = "patient-actions";
        renderPatientActions(patient, rowActions);
        detailCell.appendChild(rowActions);
        detailRow.appendChild(detailCell);

        function setExpanded(open) {
            detailRow.classList.toggle("hidden", !open);
            row.classList.toggle("expanded", open);
            toggleBtn.setAttribute("aria-expanded", String(open));
            toggleBtn.textContent = open ? "Hide" : "Details";
        }
        setExpanded(expandFirst && index === 0);

        // Button click bubbles here, so the whole row (and the button) toggles once.
        row.classList.add("expandable-row");
        row.addEventListener("click", function() {
            setExpanded(detailRow.classList.contains("hidden"));
        });

        patientTableBody.append(row, detailRow);

    });

}


// SHARED ROW: ID, name (photo + emergency flag), gender, DOB, phone, then one caller-supplied cell.
// Used by Patient Records and the KPI lists. textContent only.
function patientRow(patient, sixthCell) {
    const row = document.createElement("tr");
    const isEmergency = patient.patientType === "Emergency";
    if (isEmergency) row.classList.add("emergency-row");

    const idCell = document.createElement("td");
    idCell.textContent = patient.id;
    row.appendChild(idCell);

    const nameCell = document.createElement("td");
    const nameWrap = document.createElement("div");
    nameWrap.className = "name-cell";
    const name = document.createElement("span");
    name.textContent = patient.firstName + " " + patient.lastName;
    nameWrap.append(photoElement(patient, "table-photo"), name);
    if (isEmergency) nameWrap.appendChild(EMR.emergencyFlag());
    nameCell.appendChild(nameWrap);
    row.appendChild(nameCell);

    [patient.gender, patient.dateOfBirth, patient.phone].forEach(function(value) {
        const td = document.createElement("td");
        td.textContent = value;
        row.appendChild(td);
    });

    row.appendChild(sixthCell);
    return row;
}


// KPI LISTS — click a card to show its list below the cards (one at a time).

const kpiPanel = document.getElementById("kpiPanel");
const kpiPanelHead = document.getElementById("kpiPanelHead");
const kpiPanelBody = document.getElementById("kpiPanelBody");
let activeKpi = null;

const KPI_LISTS = {
    registered: { title: "Registered Today", subtitle: "Patients registered today", sixth: "Clinic / Appointment", empty: "No patients registered today." },
    emergency: { title: "Emergency Today", subtitle: "Identified emergency patients registered today", sixth: "Clinic / Appointment", empty: "No emergency registrations today." },
    appointments: { title: "Appointments Today", subtitle: "Booked appointments for today", sixth: "Appointment", empty: "No appointments booked for today." }
};

function setActiveKpi(key) {
    activeKpi = key;
    document.querySelectorAll(".kpi-card").forEach(function(card) {
        const on = card.dataset.kpi === activeKpi;
        card.classList.toggle("active", on);
        card.setAttribute("aria-expanded", String(on));
    });
    renderKpiPanel();
}

function toggleKpi(key) {
    setActiveKpi(activeKpi === key ? null : key);
}

document.querySelectorAll(".kpi-card").forEach(function(card) {
    card.addEventListener("click", function() { toggleKpi(card.dataset.kpi); });
});

function kpiMessageRow(text) {
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "empty-state";
    td.textContent = text;
    const tr = document.createElement("tr");
    tr.appendChild(td);
    return tr;
}

function renderKpiPanel() {
    kpiPanel.classList.toggle("hidden", !activeKpi);
    if (!activeKpi) return;
    const config = KPI_LISTS[activeKpi];
    document.getElementById("kpiPanelTitle").textContent = config.title;
    document.getElementById("kpiPanelSubtitle").textContent = config.subtitle;
    kpiPanelHead.replaceChildren();
    ["Patient ID", "Name", "Gender", "Date of Birth", "Phone", config.sixth, "Actions"].forEach(function(label) {
        const th = document.createElement("th");
        th.textContent = label;
        kpiPanelHead.appendChild(th);
    });

    let patients, visits;
    try {
        patients = getStoredPatients();
        visits = EMR.getVisits();
    } catch (err) {
        kpiPanelBody.replaceChildren(kpiMessageRow("Could not read patient or visit records."));
        return;
    }
    const today = todayLocal();
    const rows = [];

    if (activeKpi === "appointments") {
        const byId = {};
        patients.forEach(function(p) { byId[p.id] = p; });
        visits.filter(function(v) {
            return v.date === today && v.source === "appointment" && v.status !== "cancelled";
        }).sort(function(a, b) { return a.time.localeCompare(b.time); }).forEach(function(v) {
            const patient = byId[v.patientId];
            if (!patient) return;
            const clinic = EMR.clinic(v.clinicId);
            const apptCell = document.createElement("td");
            const line = document.createElement("div");
            line.textContent = (clinic ? clinic.name : "Unknown clinic") + " · " + v.time + " · ";
            const badge = document.createElement("span");
            badge.className = "visit-status status-" + v.status;
            badge.textContent = EMR.STATUS_LABELS[v.status] || v.status;
            line.appendChild(badge);
            apptCell.appendChild(line);

            const actions = [];
            if (v.status === "scheduled") actions.push(actionButton("Check in", "primary-btn", function() { checkIn(v.id); }));
            actions.push(iconActionButton("Book Appointment", "fa-solid fa-calendar-plus", "secondary-btn", function() { openVisitModal(patient.id, "book"); }));
            rows.push(withActions(patientRow(patient, apptCell), actions));
        });
    } else {
        patients.filter(function(p) {
            return p.registeredAt && localDateKey(new Date(p.registeredAt)) === today &&
                (activeKpi !== "emergency" || p.patientType === "Emergency");
        }).forEach(function(patient) {
            rows.push(withActions(patientRow(patient, clinicCell(patient, visits)), [
                iconActionButton("Book Appointment", "fa-solid fa-calendar-plus", "secondary-btn", function() { openVisitModal(patient.id, "book"); }),
                iconActionButton("Send to Clinic", "fa-solid fa-share-from-square", "primary-btn", function() { openVisitModal(patient.id, "transfer"); })
            ]));
        });
    }

    kpiPanelBody.replaceChildren.apply(kpiPanelBody, rows.length ? rows : [kpiMessageRow(config.empty)]);
}

function withActions(row, buttons) {
    const td = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "kpi-actions";
    buttons.forEach(function(b) { wrap.appendChild(b); });
    td.appendChild(wrap);
    row.appendChild(td);
    return row;
}

function checkIn(visitId) {
    let error;
    try { error = EMR.setVisitStatus(visitId, "checked-in"); } catch (err) { error = "Could not save check-in."; }
    if (error) return alert(error);
    updateKpis();
    if (!patientRecords.classList.contains("hidden")) loadPatients();
}


// CLINIC / APPOINTMENT COLUMN

function clinicCell(patient, visits) {
    const td = document.createElement("td");
    if (!visits) {
        td.textContent = "Visit data unreadable";
        return td;
    }
    const summary = EMR.patientClinicSummary(patient.id, visits);
    if (!summary) {
        td.textContent = "—";
        return td;
    }
    const v = summary.visit;
    const clinic = EMR.clinic(v.clinicId);
    const clinicName = clinic ? clinic.name : "Unknown clinic";
    const line = document.createElement("div");
    line.className = "clinic-line";

    if (summary.kind === "today" && v.status === "scheduled") {
        line.textContent = "Appointment today · " + clinicName + " · " + v.time;
        const btn = actionButton("Check in", "primary-btn checkin-btn", function() { checkIn(v.id); });
        td.append(line, btn);
    } else if (summary.kind === "today") {
        line.textContent = clinicName + " · ";
        const badge = document.createElement("span");
        badge.className = "visit-status status-" + v.status;
        badge.textContent = EMR.STATUS_LABELS[v.status] || v.status;
        line.appendChild(badge);
        td.appendChild(line);
    } else if (summary.kind === "upcoming") {
        line.textContent = "Appointment · " + clinicName + " · " + v.date + " " + v.time;
        td.appendChild(line);
    } else {
        line.textContent = "Last seen · " + clinicName + " · " + v.date;
        line.classList.add("muted");
        td.appendChild(line);
    }
    return td;
}


// UNIDENTIFIED EMERGENCY (was emergency-unidentified.html; saves the same record, then continues
// to emergency-complete.html exactly as before)

const unidentifiedModal = document.getElementById("unidentifiedModal");
const unidentifiedForm = document.getElementById("unidentifiedForm");

function showUnidentifiedForm() {
    closeEmergencyRegistration();
    unidentifiedForm.reset();
    document.getElementById("descriptionCount").textContent = "0";
    document.getElementById("arrivalDate").value = EMR.today();   // local date (the old page used UTC)
    document.getElementById("arrivalTime").value = EMR.nowTime();
    unidentifiedModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    document.getElementById("temporaryName").focus();
}

function closeUnidentifiedForm() {
    unidentifiedModal.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function handleUnidentifiedBackdropClick(event) {
    if (event.target === unidentifiedModal) closeUnidentifiedForm();
}

document.getElementById("physicalDescription").addEventListener("input", function() {
    document.getElementById("descriptionCount").textContent = this.value.length;
});

unidentifiedForm.addEventListener("submit", function(event) {
    event.preventDefault();
    const value = function(id) { return document.getElementById(id).value; };
    const record = {
        temporaryName: value("temporaryName").trim() || "Unknown Patient",
        sex: value("uSex"),
        estimatedAge: value("estimatedAge"),
        arrivalDate: value("arrivalDate"),
        arrivalTime: value("arrivalTime"),
        arrivalMode: value("arrivalMode"),
        broughtBy: value("broughtBy"),
        identificationStatus: value("identificationStatus"),
        physicalDescription: value("physicalDescription"),
        triageCategory: value("triageCategory"),
        medicoLegal: document.getElementById("medicoLegal").checked,
        patientType: "Emergency",
        isEmergency: true
    };
    let records;
    try {
        records = JSON.parse(localStorage.getItem("unidentifiedEmergencyRecords")) || [];
        if (!Array.isArray(records)) throw new Error("corrupt");
        records.push(record);
        localStorage.setItem("unidentifiedEmergencyRecords", JSON.stringify(records));
        sessionStorage.setItem("emergencyPatient", JSON.stringify(record));
    } catch (err) {
        return alert("Could not save the emergency record (storage unreadable or full). Nothing was saved.");
    }
    window.location.href = "emergency-complete.html";
});


// INITIAL STATE

syncRecordsView();
updateKpis();