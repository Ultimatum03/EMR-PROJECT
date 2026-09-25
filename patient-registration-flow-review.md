# Patient Registration Flow — Alignment Review & Plan

**Files reviewed:** `registration.html`, `registration.css`, `registration.js`
**Current data layer:** `localStorage` (no backend/database connected yet — by design at this stage)

---

## A. Gap Analysis — Flowchart vs. Current Build

### Target flow (from diagram)
```
Dashboard
  → Click "Register New Patient"
  → Search for Existing Patient (First Name, Last Name, DOB, Search button)
  → Query PostgreSQL
  → FOUND      → show patient details → continue with existing patient
  → NOT FOUND  → "New Registration" → open full registration form
```

### What's actually implemented

| Expected step | Status | Detail |
|---|---|---|
| Search-for-existing-patient screen (First/Last/DOB + Search) | **Missing** | Does not exist in `registration.html`. |
| "Register New Patient" opens search first | **Missing** | `registration.html` line 66 calls `showRegistrationForm()` directly — the full intake form opens immediately, with no intermediate step. |
| Query against PostgreSQL | **Missing** | No backend calls anywhere in `registration.js`. `patientForm`'s submit handler writes directly to `localStorage.getItem("patients")`. |
| FOUND branch → show patient details → continue with existing record | **Missing** | No such function or UI state exists. |
| NOT FOUND branch → prompt → open registration form | **Missing** | There's no not-found state, because there's no search step to fail. |

### What exists instead (and is easy to confuse with the above)

- **`#searchPatient` input** (`registration.html` line 383, driven by `getFilteredPatients()` in `registration.js`) is a **live filter on the Patient Records table**, shown via `showPatients()`. It filters patients *already loaded into the table*, by ID, first name, last name, or phone.
- This is a *post-registration browse/filter* feature, not a *pre-registration duplicate-check* feature. It runs after patients exist in the table, not before a new registration is started.

### Practical consequence
There is currently **no gate preventing duplicate registration** of the same patient. Since "Register New Patient" skips straight to the full form, the same person (same name + DOB) can be submitted multiple times with no check.

### Out-of-scope addition not in the diagram
An **Emergency Patient flow** exists (`registration.html` lines 74–132: "Identified Emergency" / "Unidentified Emergency" options, wired to `showEmergencyRegistration()` / `showRegistrationForm(true)` in `registration.js`). This isn't represented in the flowchart at all. Needs an explicit scope decision:
- Fold it into the search-first flow later (emergency + identified patients should probably still be checked against existing records), or
- Track it as a separate flow/document.

### Confirmed as expected (not a gap)
No PostgreSQL connection exists yet — everything persists to `localStorage`. This matches the current instruction not to wire up the database yet.

---

## B. Phased Plan

### Phase 1 — Data layer & schema (when DB work starts)
- Define `patients` table schema in PostgreSQL (first_name, last_name, dob, plus MRN/other identifiers already used in the form: gender, marital_status, phone, email, address, blood_group, genotype, next_of_kin, relationship, next_of_kin_phone, is_emergency, patient_type).
- Add index on `(last_name, first_name, dob)` for search performance.
- Write parameterized query functions only — no string-concatenated SQL.
- Unit tests: exact match, no match, empty/malformed input, SQL-injection-style input.

### Phase 2 — Search API endpoint
- `POST /api/patients/search` accepting `first_name`, `last_name`, `dob`.
- Server-side validation (types, length limits) — don't rely on client-side checks alone.
- Rate limiting (patient search/DOB fields are an enumeration target).
- Authorization check before running the query.
- Return minimal identifying fields in the search response; fetch full record only after explicit selection, via a separate authorized call.
- Tests: valid match, no match (returns empty, not an error that leaks existence), unauthorized request rejected, rate limit enforced.

### Phase 3 — Frontend: search step (new) — ✅ DONE (localStorage)
- Build the missing "Search for Existing Patient" screen (First Name, Last Name, DOB, Search button) as the **first** step when "Register New Patient" is clicked — replacing the current direct jump to `showRegistrationForm()`.
- Client-side validation for UX only (not a security control).
- Loading / error / no-results states.
- Escape all values before rendering results into the DOM.

### Phase 4 — Branch: record found — ✅ DONE (localStorage; server-side ID check waits for Phase 2)
- Render a found-patient summary card (name, DOB, ID — confirm exact field set).
- "Continue with this patient" → loads existing record by ID (never by raw name/DOB in the URL/query string).
- Test: correct record loads; tampering with the ID to access an unauthorized record is blocked server-side.

### Phase 5 — Branch: no record found — ✅ DONE (localStorage)
- "New Registration" prompt → opens the existing full registration form (`#registrationForm`), pre-filled with the name/DOB already typed in the search step.
- Re-validate everything server-side on submit regardless of pre-fill.
- Test: no-match path renders correctly; pre-fill populates `firstName`/`lastName`/`dateOfBirth`; garbage/empty search doesn't break the branch.

### Phase 6 — Registration form hardening (existing form, once DB is connected)
- Add server-side duplicate check before insert (re-run the Phase 1 search logic) so records can't slip in via a race or a skipped search step.
- Tests: successful registration, duplicate detection, validation failure per required field, malformed input rejected.

### Phase 7 — Integration, decisions, and hardening pass
- Decide and document: exact vs. fuzzy name matching for search (changes Phase 1 query design and Phase 3/4/5 UX copy).
- Decide: how the Emergency Patient flow (identified path) intersects with the new search-first flow.
- End-to-end test: Dashboard → Search → both branches → data persists correctly.
- Security review: auth enforced server-side on every endpoint (not just hidden buttons), all DB access parameterized, no PII in logs, rate limiting and validation enforced server-side.
- Fix the XSS item below before any real patient data flows through the table (see Section C).

---

## C. Security Note — Stored XSS in Patient Records Table

**Location:** `registration.js`, `displayPatients()`, the `row.innerHTML = ...` block.

**Issue:** Table rows are built with `innerHTML` using raw, unescaped values — `patient.id`, `firstName`, `lastName`, `gender`, `dateOfBirth`, `phone` — taken directly from the registration form fields (`registration.html` lines 173–338), which have no character restrictions beyond `type="text"`/`type="tel"`/`type="email"`.

**Risk:** Any of these fields (most easily First Name, Last Name, or Address-adjacent free text) can contain HTML/script content that gets injected into the DOM verbatim when the Patient Records table renders. This is a stored XSS path — one bad registration persists and fires for every user who later views the Patient Records table.

**Also flagged:** the inline `onclick="viewPatient('${patient.id}')"` string in the same block interpolates `patient.id` into an HTML attribute unescaped. `patient.id` is currently system-generated (`generatePatientID()`, safe by construction), so this isn't exploitable *today*, but it's a second injection point that would become exploitable if `id` generation logic changes.

**Status: FIXED (2026-09-25).** `displayPatients()` now builds rows with `createElement`/`textContent`, and the inline `onclick` was replaced with `addEventListener`. Verified in a browser test: the payload fires in the old code and not in the new. The same bug in `emergency-unidentified.html` was fixed too (see D1).

---

## D. Bug Log

Found while building Phases 3–5 and the follow-up UI work. **Status** is as of 2026-09-25.

### D1. Fixed

| # | File | Bug | Fix |
|---|---|---|---|
| F1 | `registration.js` → `displayPatients()` | Stored XSS in Patient Records table (Section C). | Rows built with `textContent`; no inline `onclick`. |
| F2 | `emergency-unidentified.html` → `renderUnidentifiedRecords()` (~line 641) | Stored XSS: `temporaryName`, `sex`, `estimatedAge`, `arrivalDate`, `triageCategory` put into `innerHTML` without escaping. | Static table shell + rows built with `textContent`. |
| F3 | `registration.html` Patient Records table | Header had 6 `<th>` but rows had 7 `<td>` (no header for the View column). | Fixed during the table redesign: 7th column is now "Details". |
| F4 | `registration.html` Identified Emergency | Opened the registration form on top of the still-open emergency modal; closing the form left the emergency modal behind. | `showPatientSearch(true)` closes the emergency modal first. |
| F5 | `registration.js` → `showRegistrationForm()` | Hid the Patient Records table when opening the form, leaving the sidebar showing "Patient Records" with no table. | Line removed; the form is a modal and doesn't need to hide the table. |
| F6 | `registration.js` → `loadPatients()` | Corrupt `patients` data in localStorage threw an uncaught error. Now that records open from a URL (`#records`), this would break on page load. | Reads through `getStoredPatients()`; shows "Could not read patient records." |
| F7 | `dashboard.html` sidebar (was O4) | Linked to `appointments.html`; file is `appointment.html`. | Sidebar config links `appointment.html`. |
| F8 | `registration.js` submit (was O8) | Raw `JSON.parse`; silent failure on corrupt data. | Guarded read with a message; a full-storage error keeps the form open so nothing typed is lost. |
| F10 | `dashboard.html` (was O1) | Loaded `auth.js`, which didn't exist → `ReferenceError`, no access check. | `auth.js` implemented; every app page checks the session in `<head>` before rendering. |
| F11 | `login page.html` | Login button was a link to `dashboard.html` inside the submit button — any input (or none) got in. | Real login via `EMR_AUTH.login`; errors shown; "Remember me" wired. |
| F12 | `dashboard.html` | Loaded a placeholder avatar from `i.pravatar.cc` — a third-party request that leaked every viewer's IP. | Removed; shared top bar shows initials. |
| F13 | `auth.js` (found by tests before release) | Lockout counter reset on every failure, so the 5-attempt lockout never triggered. | Counter only resets after an expired lock. |
| F14 | `emergency-unidentified.html` arrival date | Used `toISOString()` (UTC) → between 00:00–01:00 Lagos time the form defaulted to yesterday. | The pop-up version uses the local date. |
| F15 | `registration.css` | Text areas (Address, Physical Description) rendered in a monospace font. | `font-family: inherit` on form controls. |

### D2. Open — must fix

| # | Severity | File | Bug | Impact |
|---|---|---|---|---|
| O2 | High | `emergency-complete.html` ~line 438 | Script sets `textContent` on `#bloodPressure`, `#pulse`, etc. — those elements don't exist in the page. | Script throws and **everything after the vital-signs section never runs**. |
| O3 | Medium | `doctor-dashboard.html` line 356 | Loads `doctor-dashboard.js`, which is not in the project. | Doctor dashboard has no working script. |
| O5 | Medium | `registration.js` → `generatePatientID()` | Random 6-digit ID, never checked against existing IDs. | Two patients can share an ID; lookups by ID then return the wrong person. |
| O6 | Medium | `registration.js` submit handler | No duplicate check on submit — only the search screen gates it (planned: Phase 6, server-side). | Duplicates still possible if the search step is bypassed. |
| O7 | Medium | `appointment.html` | Booking form still has no script and isn't linked to a patient. | Appointments are now booked from the patient record instead (see E). This page is a dead end until rebuilt. |
| O9 | Low | `emergency-unidentified.html` line ~745 | `renderUnidentifiedRecords("unidentifiedRecordsList")` targets an element that doesn't exist. | Dead call on every load (harmless; returns early). |
| O10 | Low | `dashboard.js` | `noblessAdminSession` naming (sidebar branding is now "PHIFET EMR" everywhere). | Naming confusion. |
| O11 | High | `emr-data.sql` | Mixed SQL dialects: `USE` and `DATETIME2` are not PostgreSQL. | Script won't run on the planned database. |
| O12 | High | `emr-data.sql` → `users` | `password VARCHAR(100)` with no hashing noted; no `UNIQUE` on username/email. | Must store a slow hash (argon2/bcrypt), never the password. |
| O13 | Medium | `emr-data.sql` → `patients` | `patient_id INT` vs app IDs `PT-123456`; `other_name`, `email`, `address`, `marital_status`, next-of-kin fields `NOT NULL` but optional in the form; no blood group, genotype, emergency flag, photo, `registered_at`; no `(last_name, first_name, date_of_birth)` index; `updated_at` never auto-updates. No `clinics` / `visits` tables yet. | Inserts from the current form would fail; schema doesn't match the app. |
| O14 | Medium | `doctor-dashboard.html` | Loads `doctor-dashboard.css` (missing) as well as `doctor-dashboard.js` (O3); links to 7 pages that don't exist. Not moved to the unified sidebar (different role, separate decision). | Page is unstyled and non-functional. |
| O15 | Medium | `emergency-complete.html` ~line 285 | When no patient is in sessionStorage it sets `location.href` to redirect but keeps running, then throws reading `emergencyId` of `null`. | Error on every direct visit; needs a `return` after the redirect. |
| O16 | Low | `dashboard.html` sidebar | "Settings" links to `setting.html` (missing); Services / Wards sub-items link to `#`. | Dead links (kept as they were). |
| O17 | Low | `dashboard.css`, `appointment.css`, `emergency-unidentified.css`, `emergency-complete.css` | Old `.sidebar` / `.logo` rules are now unused (removed from `registration.css` only). | Dead CSS — clean up when those files are next touched. |
| O18 | Medium | Unidentified emergency records | The "View Unidentified Emergency Records" list only exists on `emergency-unidentified.html`, which is no longer linked. Records are still saved, but there's no way to browse them from the app. | Needs a decision: add them to Patient Records / the Emergency queue, or a KPI list. |
| O19 | Low | `forgot password.html` | Form does nothing (no backend); `<style>` block sits after `</html>` (invalid HTML). | Dead end for users who forget a password — for now, reset by clearing `emrUsers` in the browser. |
| O20 | Low | `emergency-complete.html` "Register another emergency" | Now returns to Registration; it can't open the Unidentified pop-up directly. | One extra click. |

### D3. Known limitations (by design for now)

| # | Item | Notes |
|---|---|---|
| L1 | Patient data is stored unencrypted in browser `localStorage`. | Fine for development. **Must not hold real patient data.** Any script on the same origin can read or change it. |
| L2 | No server-side checks (Phase 4 "ID tampering blocked server-side"). | Can't exist until the Phase 2 API. |
| L3 | KPIs rely on `registeredAt`, added 2026-09-25. | Records saved before that have no date and are not counted in "Registered Today" / "Emergency Today". |
| L4 | "Emergency Today" counts identified emergency registrations only. | Unidentified emergencies live in a separate store (`unidentifiedEmergencyRecords`) and are not counted. |
| L5 | KPIs and records update live across tabs in the same browser (storage event). | Other computers see changes only after the backend exists. |
| L6 | Patient photos are stored in localStorage (~20–30 KB each after resizing). | Browser storage is ~5 MB total → roughly 150–200 patients with photos. Must move to server storage. Save errors on a full store are caught and reported. |
| L8 | Auth is a client-side prototype: users, hashes and a mock (unsigned) JWT live in this browser's storage. It is **not a security boundary** — anyone at the computer can edit storage. Passwords are salted PBKDF2-SHA256 (100k iterations); 5 failed logins lock the username for 5 minutes. | Backend must issue/verify signed tokens (never accept `alg: none`), ideally as an httpOnly cookie, and enforce lockout server-side. |
| L9 | Roles: all four default users are "Staff" (no role model yet). | Needed before any role-based access. |
| L10 | Dark mode is complete on Registration and Queue; Dashboard / Appointment / Emergency Record get the main surfaces only; Login / Forgot Password stay light. | Convert those stylesheets to theme tokens when next touched. |
| L11 | Notification bell has no data source (no unread dot shown). | Wire to real notifications later. |
| L7 | "Live" queue = same browser only (storage event + 30 s refresh). | Multi-workstation queues need the backend (websocket or polling). |

### D4. Open decisions (Phase 7)

| # | Decision |
|---|---|
| Q1 | Existing patient arriving as an emergency: "Continue" only shows the record — nothing records the emergency visit. Likely needs a visit/encounter record separate from the patient record. |
| Q2 | Same name + DOB, different person: the found screen has no "not this person — register new" option. |
| Q3 | Exact vs fuzzy name matching (currently exact, case-insensitive, trimmed). |


---

## E. Unified Sidebar, Clinics, Visits & Queue (2026-09-25)

### What was built

| Item | Where |
|---|---|
| Unified sidebar — one config (`SIDEBAR_MENUS`), each page shows only its own items, Dashboard always first, collapse state remembered | `sidebar.js`, `sidebar.css`; used by dashboard, registration, queue, appointment, emergency-unidentified, emergency-complete |
| Shared data layer — clinics, patients, visits, capacity, status rules | `emr-data.js` |
| Edit patient (same ID, registration type and date kept; duplicate name+DOB warning) | Detail modal + expanded row → **Edit** |
| Patient photo — upload (JPEG/PNG ≤ 5 MB) or webcam; re-encoded to 256px JPEG (strips metadata); only our own JPEG format is ever rendered | Registration form |
| "Status" column → **Clinic / Appointment**: today's visit + status, or today's appointment + **Check in**, or next appointment, or last clinic | Patient Records |
| Emergency flag on the row | Patient Records, Queue |
| Live patient queue per clinic — New / Follow-up per clinic, Check in → Start consultation → Complete | `queue.html`, `queue.js`, `queue.css` |
| After registration → **Send to Clinic** with today's load / capacity; full clinics disabled; emergency registrations preselect Emergency | Registration |
| Book appointment (clinic, date, time) | Detail modal + expanded row |

### Data model (localStorage keys → future tables)

- `patients` — as before, plus `photo`, `updatedAt`.
- `visits` — `{ id, patientId, clinicId, date, time, source: appointment | walk-in | emergency, status, createdAt, checkedInAt, inConsultationAt, doneAt }`.
- Status flow: `scheduled → checked-in → in-consultation → done` (`scheduled → cancelled` allowed in the data layer; no UI yet).
- Clinics are a config list in `emr-data.js` (placeholders: General OPD 40, Paediatrics 25, Antenatal 20, Dental 15, Eye 15, Emergency no cap).

### Rules chosen (confirm or change)

| # | Rule |
|---|---|
| R1 | Capacity = visits per day, counting every non-cancelled visit (scheduled, waiting, with doctor, done). |
| R2 | Full clinics can't be selected — for walk-ins and bookings alike. Enforced in the data layer, not just the UI. Emergency clinic has no cap. |
| R3 | "New" = patient has no earlier non-cancelled visit to **that clinic**. |
| R4 | Queue order: with doctor → waiting (emergencies first, then by time) → not yet arrived → done. |
| R5 | One open visit per patient per clinic per day. |
| R6 | Only today's appointments can be checked in. |
| R7 | Walk-in / transfer visits start as "checked-in" (patient is present). |


---

## F. Auth, Theme, Top Bar & Queue Redesign (2026-09-25)

| Item | Where |
|---|---|
| Login (favour, praise, feranmi, heritage — temporary password `password`), forced password change on first login, profile menu (Change password, Logout), sidebar Logout, cross-tab logout, 8-hour sessions, lockout | `auth.js`, `login page.html`, `topbar.js` |
| Light/dark theme toggle in the top bar, remembered per browser | `theme.js`, `theme.css`, `topbar.js` |
| Shared top bar (theme, bell, profile, date/time) | `topbar.js`, `topbar.css` — dashboard, registration, queue, appointment, emergency record |
| Queue redesigned to the approved mock: clinic cards, search + Status / Visit Type / Time Range filters (applied on Filter), numbered table, Initial Consultation / Follow-up, View + ⋮ status actions, pagination (10/page) | `queue.html`, `queue.js`, `queue.css` |
| Patient Records: title "Patient Records", KPI cards hidden, loading skeleton + empty states | `registration.*`, `emr-data.js` (`fetchPatients`) |
| Unidentified Emergency form now a pop-up on Registration; removed from all sidebars | `registration.html` / `.js` |
| Icon-only New Patient / Emergency (top bar) and Book / Send (KPI lists), all with labels + tooltips | `registration.*` |
