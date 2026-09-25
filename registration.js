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
    const patients = JSON.parse(localStorage.getItem("patients")) || [];
    if (!Array.isArray(patients)) {
        throw new Error("Stored patient data is corrupted.");
    }
    return patients;
}


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

// Single field list shared by the detail modal and the expanded table row.
const DETAIL_GROUPS = [
    ["Personal", [["Patient ID", "id"], ["First Name", "firstName"], ["Last Name", "lastName"],
        ["Other Name", "otherName"], ["Date of Birth", "dateOfBirth"], ["Gender", "gender"],
        ["Marital Status", "maritalStatus"]]],
    ["Medical", [["Blood Group", "bloodGroup"], ["Genotype", "genotype"]]],
    ["Contact", [["Phone", "phone"], ["Email", "email"], ["Address", "address"]]],
    ["Next of Kin", [["Name", "nextOfKin"], ["Relationship", "relationship"],
        ["Phone", "nextOfKinPhone"]]],
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

// textContent only — stored values are never parsed as HTML.
function renderDetailGroups(patient, container) {
    container.replaceChildren();
    const grid = document.createElement("div");
    grid.className = "detail-grid";
    DETAIL_GROUPS.forEach(function(group) {
        const section = document.createElement("section");
        const heading = document.createElement("h4");
        heading.textContent = group[0];
        const dl = document.createElement("dl");
        dl.className = "detail-list";
        group[1].forEach(function(field) {
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
    registrationTitle.textContent = "New Patient Registration";
    registrationSubtitle.textContent = "Enter the patient's information below";
    document.body.classList.remove("modal-open");

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
    if (onRecords) showPatients();
    else patientRecords.classList.add("hidden");
    document.getElementById("recordsNavLink").classList.toggle("active", onRecords);
    document.getElementById("registrationNavLink").classList.toggle("active", !onRecords);
}

window.addEventListener("hashchange", syncRecordsView);


// KPI CARDS

function updateKpis() {
    const registered = document.getElementById("kpiRegisteredToday");
    const emergency = document.getElementById("kpiEmergencyToday");
    let today;
    try {
        const key = todayLocal();
        today = getStoredPatients().filter(function(p) {
            return p.registeredAt && localDateKey(new Date(p.registeredAt)) === key;
        });
    } catch (err) {
        registered.textContent = emergency.textContent = "—";
        return;
    }
    registered.textContent = today.length;
    emergency.textContent = today.filter(function(p) { return p.patientType === "Emergency"; }).length;
}


// REGISTER PATIENT

patientForm.addEventListener("submit", function(event) {

    event.preventDefault();


    const patient = {

        id: generatePatientID(),

        firstName:
            document.getElementById("firstName").value,

        lastName:
            document.getElementById("lastName").value,

        otherName:
            document.getElementById("otherName").value,

        dateOfBirth:
            document.getElementById("dateOfBirth").value,

        gender:
            document.getElementById("gender").value,

        maritalStatus:
            document.getElementById("maritalStatus").value,

        phone:
            document.getElementById("phone").value,

        email:
            document.getElementById("email").value,

        address:
            document.getElementById("address").value,

        bloodGroup:
            document.getElementById("bloodGroup").value,

        genotype:
            document.getElementById("genotype").value,

        nextOfKin:
            document.getElementById("nextOfKin").value,

        relationship:
            document.getElementById("relationship").value,

        nextOfKinPhone:
            document.getElementById("nextOfKinPhone").value,

        isEmergency:
            isEmergencyRegistration,

        patientType:
            isEmergencyRegistration ? "Emergency" : "Routine",

        registeredAt:
            new Date().toISOString()

    };


    let patients =
        JSON.parse(localStorage.getItem("patients")) || [];


    patients.push(patient);


    localStorage.setItem(
        "patients",
        JSON.stringify(patients)
    );


    alert(
        "Patient registered successfully!\n\nPatient ID: "
        + patient.id + "\nRegistration Type: "
        + (patient.patientType || "Routine")
    );


    isEmergencyRegistration = false;
    registrationTitle.textContent = "New Patient Registration";
    registrationSubtitle.textContent = "Enter the patient's information below";
    patientForm.reset();

    updateKpis();
    if (!patientRecords.classList.contains("hidden")) loadPatients();

});


document.addEventListener("keydown", function(event) {

    if (event.key !== "Escape") {
        return;
    }

    if (!patientDetail.classList.contains("hidden")) {
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

function loadPatients() {

    let patients;
    try {
        patients = getStoredPatients();
    } catch (err) {
        const cell = document.createElement("td");
        cell.colSpan = 7;
        cell.className = "empty-state";
        cell.textContent = "Could not read patient records.";
        const row = document.createElement("tr");
        row.appendChild(cell);
        patientTableBody.replaceChildren(row);
        return;
    }

    const filtered = getFilteredPatients(patients);
    const hasQuery = document.getElementById("searchPatient").value.trim() !== "";

    // A search that narrows to exactly one record opens it expanded.
    displayPatients(filtered, hasQuery && filtered.length === 1);

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

function displayPatients(patients, expandFirst = false) {

    patientTableBody.innerHTML = "";


    if (patients.length === 0) {

        patientTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No matching patient found.
                </td>
            </tr>
        `;

        return;

    }


    // Built with textContent — stored values are never parsed as HTML.
    patients.forEach(function(patient, index) {

        const row = document.createElement("tr");

        [patient.id, patient.firstName + " " + patient.lastName,
            patient.gender, patient.dateOfBirth, patient.phone]
            .forEach(function(value) {
                const td = document.createElement("td");
                td.textContent = value;
                row.appendChild(td);
            });

        const isEmergency = patient.patientType === "Emergency";
        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "status-badge " + (isEmergency ? "status-emergency" : "status-regular");
        badge.textContent = isEmergency ? "Emergency" : "Routine";
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

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


// INITIAL STATE

syncRecordsView();
updateKpis();
