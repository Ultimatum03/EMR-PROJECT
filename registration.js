const patientForm = document.getElementById("patientForm");

const registrationForm = document.getElementById("registrationForm");
const patientRecords = document.getElementById("patientRecords");

const patientTableBody = document.getElementById("patientTableBody");
const registerNewPatientButton = document.getElementById("registerNewPatientButton");
const newPatientOptions = document.getElementById("newPatientOptions");
const registrationType = document.getElementById("registrationType");

registerNewPatientButton.addEventListener("click", function () {
    const isOpen = !newPatientOptions.classList.contains("hidden");

    newPatientOptions.classList.toggle("hidden", isOpen);
    registerNewPatientButton.setAttribute("aria-expanded", String(!isOpen));
});

newPatientOptions.addEventListener("click", function (event) {
    const option = event.target.closest("[data-registration-type]");

    if (!option) {
        return;
    }

    showRegistrationForm(option.dataset.registrationType);
    newPatientOptions.classList.add("hidden");
    registerNewPatientButton.setAttribute("aria-expanded", "false");
});


// SHOW REGISTRATION FORM

function showRegistrationForm(type = "register") {

    registrationForm.classList.remove("hidden");

    patientRecords.classList.add("hidden");

    document.body.classList.add("modal-open");
    registrationType.value = type;

    document.getElementById("firstName").focus();

}


// CLOSE REGISTRATION FORM

function closeRegistrationForm() {

    registrationForm.classList.add("hidden");

    document.body.classList.remove("modal-open");

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

        nextOfKin:
            document.getElementById("nextOfKin").value,

        relationship:
            document.getElementById("relationship").value,

        nextOfKinPhone:
            document.getElementById("nextOfKinPhone").value,

        nextOfKinAddress:
            document.getElementById("nextOfKinAddress").value,

        status: registrationType.value === "emergency" ? "Emergency" : "Active"

    };


    let patients =
        JSON.parse(localStorage.getItem("patients")) || [];


    patients.push(patient);


    localStorage.setItem(
        "patients",
        JSON.stringify(patients)
    );


    alert(
        (patient.status === "Emergency" ? "Emergency case saved successfully!" : "Patient registered successfully!")
        + "\n\nPatient ID: "
        + patient.id
    );


    patientForm.reset();
    registrationType.value = "register";

});


document.addEventListener("keydown", function(event) {

    if (event.key === "Escape" && !registrationForm.classList.contains("hidden")) {

        closeRegistrationForm();

    }

});


// GENERATE PATIENT ID

function generatePatientID() {

    const number =
        Math.floor(100000 + Math.random() * 900000);

    return "PT-" + number;

}


// LOAD PATIENTS

function loadPatients() {

    const patients =
        JSON.parse(localStorage.getItem("patients")) || [];


    patientTableBody.innerHTML = "";


    if (patients.length === 0) {

        patientTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    No patients registered yet.
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

            <td>${patient.status}</td>

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

        const search =
            this.value.toLowerCase();


        const patients =
            JSON.parse(localStorage.getItem("patients")) || [];


        const filtered =
            patients.filter(function(patient) {

                return (

                    patient.id
                        .toLowerCase()
                        .includes(search)

                    ||

                    patient.firstName
                        .toLowerCase()
                        .includes(search)

                    ||

                    patient.lastName
                        .toLowerCase()
                        .includes(search)

                    ||

                    patient.phone
                        .toLowerCase()
                        .includes(search)

                );

            });


        displayPatients(filtered);

    });


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

            <td>${patient.status}</td>

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