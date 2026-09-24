const patientForm = document.getElementById("patientForm");

const registrationForm = document.getElementById("registrationForm");
const emergencyRegistration = document.getElementById("emergencyRegistration");
const patientRecords = document.getElementById("patientRecords");
const registrationTitle = document.getElementById("registrationTitle");
const registrationSubtitle = document.getElementById("registrationSubtitle");

const patientTableBody = document.getElementById("patientTableBody");
const statusFilter = document.getElementById("statusFilter");

let isEmergencyRegistration = false;


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

    patientRecords.classList.add("hidden");

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
            isEmergencyRegistration ? "Emergency" : "Routine"

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

});


document.addEventListener("keydown", function(event) {

    if (event.key !== "Escape") {
        return;
    }

    if (!registrationForm.classList.contains("hidden")) {
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

    const patients =
        JSON.parse(localStorage.getItem("patients")) || [];

    displayPatients(getFilteredPatients(patients));

}


// VIEW PATIENT

function viewPatient(patientID) {

    const patients =
        JSON.parse(localStorage.getItem("patients")) || [];


    const patient =
        patients.find(function(item) {

            return item.id === patientID;

        });


    if (!patient) {

        alert("Patient not found.");

        return;

    }


    alert(

        "PATIENT INFORMATION\n\n" +

        "Patient ID: " + patient.id + "\n" +

        "Name: " +
        patient.firstName + " " +
        patient.lastName + "\n" +

        "Gender: " + patient.gender + "\n" +

        "Date of Birth: " +
        patient.dateOfBirth + "\n" +

        "Phone: " + patient.phone + "\n" +

        "Blood Group: " +
        patient.bloodGroup + "\n" +

        "Genotype: " +
        patient.genotype

    );

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

function displayPatients(patients) {

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


    patients.forEach(function(patient) {

        const row = document.createElement("tr");

        row.innerHTML = `

            <td>${patient.id}</td>

            <td>
                ${patient.firstName}
                ${patient.lastName}
            </td>

            <td>${patient.gender}</td>

            <td>${patient.dateOfBirth}</td>

            <td>${patient.phone}</td>

            <td>
                <span class="status-badge ${patient.patientType === "Emergency" ? "status-emergency" : "status-regular"}">
                    ${patient.patientType === "Emergency" ? "Emergency" : "Routine"}
                </span>
            </td>

            <td>
                <button
                    class="secondary-btn"
                    onclick="viewPatient('${patient.id}')"
                >
                    View
                </button>
            </td>

        `;

        patientTableBody.appendChild(row);

    });

}
