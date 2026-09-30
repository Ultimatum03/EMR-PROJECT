# PHIFET EMR: progress summary

Plain HTML/CSS/JS app using a shared sidebar and top bar, with data in `localStorage` for now (no backend yet).

## 1. Files reviewed

| Area | Files |
|---|---|
| Shell | `sidebar.js`, `sidebar.css`, `topbar.js`, `topbar.css` |
| Auth and theme | `auth.js`, `theme.js`, `theme.css` |
| Dashboard | `dashboard.html`, `dashboard.css`, `dashboard.js` |
| Queue | `queue.html`, `queue.js`, `queue.css` |
| Shared base and data | `registration.css`, `emr-data.js` |

Not seen: `registration.html`, `appointment.html`, `setting.html`, `login page.html`, and any registration JS.

## 2. How the app works

- **Page skeleton:** each page loads `theme.js` and `auth.js`, then calls `EMR_AUTH.requireAccess()`. The body has `<aside id="appSidebar" data-page="...">`, a `.main.app-main` wrapper and `<header id="appTopbar">`. `sidebar.js` and `topbar.js` load last.
- **Sidebar menus:** `sidebar.js` builds the menu from `SIDEBAR_MENUS`, keyed by `data-page`. An unknown key falls back to a Dashboard-only menu.
- **Data layer:** `emr-data.js` exposes a global `EMR` with `patients` and `visits` in `localStorage`. There are 6 clinics in `EMR.CLINICS`: General OPD, Paediatrics, Antenatal, Dental, Eye, Emergency.
- **Visit status flow:** scheduled → checked-in ("Waiting") → in-consultation → done, plus cancelled.
- **Styling:** `theme.css` tokens give dark mode. `registration.css` is the real shared base (reset, `.card`, `.hidden`, `.modal-open`, `.registration-modal`, form classes, `.primary-btn`, detail and photo styles). `queue.css` adds clinic cards, tone colors and status badges.

## 3. Findings (reported, none changed silently)

**Security**
1. `auth.js` is not a security boundary. The token is unsigned (`alg: none`) and the role is read from `localStorage`, so anyone can edit it. Role checks in the browser are UI only, and real enforcement needs the backend.
2. All four default accounts (favour, praise, feranmi, heritage) have role `Staff`. There is no nurse or doctor role.
3. Default users are only created if `emrUsers` doesn't exist yet, so adding a role later needs a migration for browsers that already ran the app.
4. Clinical data in `localStorage` is unencrypted, so an XSS bug would expose all of it. The app uses `textContent` and avoids `innerHTML`, which is the right habit to keep.
5. The Font Awesome CDN link has no SRI (integrity) attribute.
6. `requireAccess()` hides the page and redirects, but later scripts on the page still run.
7. Logout in `sidebar.js` does nothing, silently, if `auth.js` failed to load.
8. `dashboard.js` is dead code (`#adminPortalLink` doesn't exist) and checks a `noblessAdminSession` flag that anyone can set.

**Data and code**
9. `emr-data.js` render helpers (`renderDetailGroups`, `photoElement`) are safe: they use `textContent` only, and photos must match a strict `data:image/jpeg;base64` pattern under 300 KB.
10. `queue.js` builds CSS class names from stored values (`"status-" + v.status`, `"type-" + v.source`). Low risk, but a tampered value could inject classes.
11. In `queue.js`, `STATUS_ORDER[x] || 0` sorts any unknown status to the top of the list.
12. `queue.js` re-renders its table every 30 seconds, so any form placed inside it would be wiped.
13. `setVisitStatus` records a time but not who made the change, and the time is the client clock.
14. Anyone logged in can advance a visit status, including "Start consultation".
15. `dashboard.css` still has old `.sidebar`, `.main`, `header` and global `.active` rules that overlap the newer sidebar and top bar styles.
16. The data model has no vitals, allergies, weight, wards, beds or admissions.

## 4. Decisions made

- First nurse screen: **Nurse station** (waiting patients plus recording vitals).
- Existing files that may be edited: **`sidebar.js` only**. `auth.js`, `emr-data.js`, `queue.js` and the CSS files stay untouched.

## 5. Delivered: Nurse Station

Files: `nurse-station.html`, `nurse-station.js`, `nurse-data.js`, `nurse.css`, plus an edited `sidebar.js`.

- **Waiting list:** today's `checked-in` visits across all clinics, emergencies first, then by time.
- **Vitals form:** temperature, pulse, respiratory rate, BP systolic and diastolic, SpO2, weight and an optional note. At least one measurement is required, and BP needs both numbers with systolic above diastolic.
- **Storage:** append-only in its own `vitals` key, linked to the visit id and the patient id. It records who and when from the session. The shared visit status flow is untouched.
- **Row display:** "Taken 10:32 by favour", and the button changes to "Record again".
- **No clinical alerts.** The number limits only catch typos and are not normal ranges, which differ by age.
- **`sidebar.js` changes (exactly three):**
  1. added `NURSE_STATION` (`nurse-station.html`, icon `fa-user-nurse`)
  2. added it after `QUEUE` in the `dashboard` menu
  3. added a `"nurse-station": [DASHBOARD, NURSE_STATION, QUEUE]` menu key
- **Line endings** are CRLF, as in the original.
- **Dependencies:** the page loads `registration.css` and `queue.css`, so changes to those files could affect it.
- **Access:** any logged-in user can open the page, as with the queue.

## 6. Testing

Headless Chromium (Playwright) against copies of the real files: **31 of 31 passed**. It covered:

- logged-out redirect and the real login flow
- filtering and sort order
- an XSS attempt in a patient name (not executed, no element injected)
- validation of empty, out-of-range, non-numeric, `1e2`, negative and BP-pairing inputs
- a successful save with the exact record shape
- append-only behavior
- API guards for scheduled, in-consultation, yesterday's and unknown visits
- a 501-character note
- a mid-entry status change and an expired session
- corrupt and tampered storage
- typing surviving the table refresh
- no uncaught JavaScript errors

**Not tested**
- Font Awesome icons (the sandbox has no network), including whether `fa-user-nurse` exists in your FA 6.6 build
- real phones, or browsers other than Chromium at desktop width
- separately confirming the script stops before rendering when logged out
- multiple computers, since everything is browser-local

A bug found by the tests during the build: the form's error message stayed visible after a successful save. I fixed it in `nurse-station.js` and re-ran the full suite.

## 7. Open items

- Add an SRI attribute to the Font Awesome link, or self-host it.
- Remove the dead code in `dashboard.js`, and decide what to do about the old rules in `dashboard.css`.
- Fix the `STATUS_ORDER[x] || 0` sort hazard in `queue.js` if new statuses are ever added.
- Add role enforcement and an audit trail (who, when) in the backend.
- Wards and beds (dashboard shows a static "0 / 50") and the Services and Wards submenus (`#` links) have no pages or data.
- The medication administration and nursing notes and handover screens are not built.

## 8. Requested next: Clinic module

**Request:** clicking the clinic module in the sidebar shows a list of clinics. Each clinic's dashboard shows the doctors available in that clinic.

**Blocker:** there is no doctors data anywhere in the app. Visits store a clinic but not a doctor, and no account has a doctor role. I asked two questions, and no answers have come back yet:

1. **Where do the doctors come from?** A list managed in the app, a fixed sample list in code, or a real list you send.
2. **What does "available" mean?** Just assigned to the clinic, on duty today from a weekly schedule, or a status set by hand (available, unavailable, on leave).

Once these are answered, I'll list which files I would touch before building. This includes `sidebar.js`, which needs a Clinic entry. Test coverage will follow the same standard as the nurse station.
