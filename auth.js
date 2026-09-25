// Client-side auth for the prototype stage (no backend yet).
// NOT a security boundary: anyone with this browser can edit localStorage. It gives the app a real
// login flow and keeps passwords out of plain text (salted PBKDF2). When the backend exists, the
// server must issue/verify the token (signed; never accept alg "none") — ideally in an httpOnly cookie.
const EMR_AUTH = (function () {
    const USERS_KEY = "emrUsers";
    const TOKEN_KEY = "emrToken";
    const ATTEMPTS_KEY = "emrLoginAttempts";
    const LOGIN_PAGE = "login page.html";
    const SESSION_HOURS = 8;
    const ITERATIONS = 100000;
    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 5;
    const DEFAULT_USERS = ["favour", "praise", "feranmi", "heritage"];

    // ---------- encoding / crypto helpers ----------
    const enc = new TextEncoder();
    function b64(bytes) { return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes))); }
    function unb64(str) { return Uint8Array.from(atob(str), function (c) { return c.charCodeAt(0); }); }
    function b64url(obj) { return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
    function unb64url(str) { return JSON.parse(atob(str.replace(/-/g, "+").replace(/_/g, "/"))); }

    function derive(password, saltBytes, iterations) {
        return crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
            .then(function (key) {
                return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: iterations }, key, 256);
            });
    }

    function sameBytes(a, b) {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff === 0;
    }

    function hashRecord(password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        return derive(password, salt, ITERATIONS).then(function (bits) {
            return { salt: b64(salt), hash: b64(bits), iterations: ITERATIONS };
        });
    }

    // ---------- storage ----------
    function readJson(storage, key, fallback) {
        try {
            const value = JSON.parse(storage.getItem(key));
            return value && typeof value === "object" ? value : fallback;
        } catch (e) { return fallback; }
    }

    function getUsers() { return readJson(localStorage, USERS_KEY, null); }
    function saveUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }

    // First run: create the default accounts with the temporary password "password".
    function ensureUsers() {
        const existing = getUsers();
        if (existing) return Promise.resolve(existing);
        return Promise.all(DEFAULT_USERS.map(function () { return hashRecord("password"); })).then(function (records) {
            const users = {};
            DEFAULT_USERS.forEach(function (username, i) {
                users[username] = Object.assign({
                    name: username.charAt(0).toUpperCase() + username.slice(1),
                    role: "Staff",
                    mustChange: true
                }, records[i]);
            });
            saveUsers(users);
            return users;
        });
    }

    // ---------- token (mock JWT: header.payload.signature, unsigned) ----------
    function issueToken(username, user, remember) {
        const now = Math.floor(Date.now() / 1000);
        const payload = { sub: username, name: user.name, role: user.role, iat: now, exp: now + SESSION_HOURS * 3600 };
        const token = b64url({ alg: "none", typ: "JWT" }) + "." + b64url(payload) + ".unsigned";
        (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
        (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
    }

    function clearToken() {
        try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    }

    function getSession() {
        let token = null;
        try { token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
        if (!token) return null;
        try {
            const parts = token.split(".");
            if (parts.length !== 3) throw new Error("malformed");
            const payload = unb64url(parts[1]);
            const users = getUsers();
            if (typeof payload.sub !== "string" || !users || !users[payload.sub]) throw new Error("unknown user");
            if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) throw new Error("expired");
            const user = users[payload.sub];
            return { username: payload.sub, name: user.name, role: user.role, exp: payload.exp, mustChange: !!user.mustChange };
        } catch (e) {
            clearToken();
            return null;
        }
    }

    // ---------- lockout ----------
    function attempts() { return readJson(localStorage, ATTEMPTS_KEY, {}); }
    function lockedMinutes(username) {
        const a = attempts()[username];
        return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
    }
    function recordFailure(username) {
        const all = attempts();
        const prev = all[username];
        // Start fresh only when there is no record or a previous lock has expired.
        const a = prev && !(prev.until && prev.until <= Date.now()) ? prev : { count: 0, until: 0 };
        a.count = (a.count || 0) + 1;
        if (a.count >= MAX_ATTEMPTS) { a.until = Date.now() + LOCK_MINUTES * 60000; a.count = 0; }
        all[username] = a;
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
    }
    function clearFailures(username) {
        const all = attempts();
        delete all[username];
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
    }

    // ---------- public API ----------
    function login(usernameInput, password, remember) {
        const username = String(usernameInput || "").trim().toLowerCase();
        if (!username || !password) return Promise.resolve({ error: "Enter your username and password." });
        const locked = lockedMinutes(username);
        if (locked) return Promise.resolve({ error: "Too many failed attempts. Try again in " + locked + " minute(s)." });

        return ensureUsers().then(function (users) {
            const user = users[username];
            // Unknown users still pay the hashing cost, so timing doesn't reveal which usernames exist.
            const salt = user ? unb64(user.salt) : new Uint8Array(16);
            return derive(password, salt, user ? user.iterations : ITERATIONS).then(function (bits) {
                if (!user || !sameBytes(new Uint8Array(bits), unb64(user.hash))) {
                    recordFailure(username);
                    return { error: "Invalid username or password." };
                }
                clearFailures(username);
                issueToken(username, user, !!remember);
                return { ok: true, mustChange: !!user.mustChange };
            });
        });
    }

    // Returns "" on success or an error message.
    function changePassword(current, next, confirm) {
        const session = getSession();
        if (!session) return Promise.resolve("Your session has expired. Please log in again.");
        if (next !== confirm) return Promise.resolve("New passwords do not match.");
        if (typeof next !== "string" || next.length < 8 || next.length > 128) return Promise.resolve("New password must be 8–128 characters.");
        if (next.toLowerCase() === "password" || next.toLowerCase() === session.username) return Promise.resolve("Choose a password that isn't 'password' or your username.");
        if (next === current) return Promise.resolve("New password must be different from the current one.");
        const users = getUsers();
        const user = users && users[session.username];
        if (!user) return Promise.resolve("Account not found.");
        return derive(current, unb64(user.salt), user.iterations).then(function (bits) {
            if (!sameBytes(new Uint8Array(bits), unb64(user.hash))) return "Current password is incorrect.";
            return hashRecord(next).then(function (record) {
                const fresh = getUsers(); // re-read in case another tab changed it
                Object.assign(fresh[session.username], record, { mustChange: false });
                saveUsers(fresh);
                return "";
            });
        });
    }

    function safeNext(value) {
        return typeof value === "string" && /^[A-Za-z0-9 _-]+\.html(#[A-Za-z0-9=_-]+)?$/.test(value) &&
            value !== LOGIN_PAGE ? value : "dashboard.html";
    }

    function currentPage() {
        return decodeURIComponent(location.pathname.split("/").pop() || "") + location.hash;
    }

    function redirectToLogin() {
        location.replace(LOGIN_PAGE + "?next=" + encodeURIComponent(safeNext(currentPage())));
    }

    // Call from <head>. Hides the page and redirects if there is no valid session.
    function requireAccess() {
        const session = getSession();
        if (!session) {
            document.documentElement.style.display = "none";
            redirectToLogin();
            return null;
        }
        return session;
    }

    function logout() {
        clearToken();
        location.replace(LOGIN_PAGE);
    }

    // Kept for dashboard.html's existing call: fills any [data-auth-name] / [data-auth-role].
    function applySessionToPage(session) {
        if (!session) return;
        document.querySelectorAll("[data-auth-name]").forEach(function (el) { el.textContent = session.name; });
        document.querySelectorAll("[data-auth-role]").forEach(function (el) { el.textContent = session.role; });
    }

    // Logging out (or the session vanishing) in one tab logs out every tab.
    window.addEventListener("storage", function (event) {
        if (event.key === TOKEN_KEY && !getSession() && !/login page\.html$/.test(decodeURIComponent(location.pathname))) redirectToLogin();
    });

    return {
        login: login, logout: logout, getSession: getSession, requireAccess: requireAccess,
        changePassword: changePassword, applySessionToPage: applySessionToPage, safeNext: safeNext
    };
})();
