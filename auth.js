// ============================================
// WROM GPT - LOGIN SYSTEM (Supabase Auth)
// Load AFTER script.js
// ============================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.WROM_TOKEN = null;

let authMode = "login";

const authScreen = document.getElementById("authScreen");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authConfirm = document.getElementById("authConfirm");
const authMessage = document.getElementById("authMessage");
const authSubmit = document.getElementById("authSubmit");
const authSubmitText = document.getElementById("authSubmitText");


// ---------- helpers ----------

function setAuthMessage(text, type) {
    authMessage.textContent = text || "";
    authMessage.className = "auth-message " + (type || "");
}

function setAuthLoading(on) {
    authSubmit.disabled = on;
    authSubmit.classList.toggle("loading", on);
}

function friendlyError(error) {
    const msg = String(error?.message || "");

    if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
    if (/email not confirmed/i.test(msg)) return "Please confirm your email first (check your inbox).";
    if (/already registered|already been registered/i.test(msg)) return "This email already has an account. Try logging in.";
    if (/rate limit|too many/i.test(msg)) return "Too many tries. Please wait a minute.";
    if (/network|failed to fetch/i.test(msg)) return "No internet connection.";

    return msg || "Something went wrong.";
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


// ---------- tabs ----------

function switchAuthTab(mode) {

    authMode = mode;

    document.getElementById("authTabs").dataset.mode = mode;

    document.getElementById("tabLogin").classList.toggle("active", mode === "login");
    document.getElementById("tabSignup").classList.toggle("active", mode === "signup");

    document.getElementById("signupExtras").classList.toggle("open", mode === "signup");

    document.getElementById("authForgot").style.display =
        mode === "login" ? "block" : "none";

    document.getElementById("authSub").textContent =
        mode === "login" ? "WELCOME BACK" : "CREATE YOUR ACCOUNT";

    authSubmitText.textContent =
        mode === "login" ? "Log In" : "Create Account";

    authPassword.autocomplete =
        mode === "login" ? "current-password" : "new-password";

    setAuthMessage("");
}

function togglePasswordView() {
    const show = authPassword.type === "password";
    authPassword.type = show ? "text" : "password";
    if (authConfirm) authConfirm.type = show ? "text" : "password";
}


// ---------- password strength ----------

authPassword.addEventListener("input", () => {

    if (authMode !== "signup") return;

    const value = authPassword.value;

    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const levels = [
        { w: "8%", c: "#ff5c5c", t: "Very weak" },
        { w: "25%", c: "#ff8a4c", t: "Weak" },
        { w: "50%", c: "#ffc94d", t: "Okay" },
        { w: "75%", c: "#9be564", t: "Good" },
        { w: "100%", c: "#36e68a", t: "Strong" }
    ];

    const level = levels[Math.max(0, Math.min(score - 1, 4))];

    const bar = document.getElementById("strengthBar");
    const text = document.getElementById("strengthText");

    if (!value) {
        bar.style.width = "0";
        text.textContent = "Use 8+ characters with numbers & symbols";
        return;
    }

    bar.style.width = level.w;
    bar.style.background = level.c;
    text.textContent = level.t;
});


// ---------- submit ----------

async function submitAuth() {

    const email = authEmail.value.trim();
    const password = authPassword.value;

    authEmail.classList.remove("invalid");
    authPassword.classList.remove("invalid");
    authConfirm.classList.remove("invalid");

    if (!validEmail(email)) {
        authEmail.classList.add("invalid");
        setAuthMessage("Enter a valid email address.", "error");
        return;
    }

    if (!password) {
        authPassword.classList.add("invalid");
        setAuthMessage("Enter your password.", "error");
        return;
    }

    if (authMode === "signup") {

        if (password.length < 6) {
            authPassword.classList.add("invalid");
            setAuthMessage("Password must be at least 6 characters.", "error");
            return;
        }

        if (password !== authConfirm.value) {
            authConfirm.classList.add("invalid");
            setAuthMessage("Passwords do not match.", "error");
            return;
        }
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {

        if (authMode === "login") {

            const { error } = await sb.auth.signInWithPassword({ email, password });

            if (error) throw error;

        } else {

            const { data, error } = await sb.auth.signUp({ email, password });

            if (error) throw error;

            // Supabase returns an empty identities list if the email already exists
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                throw new Error("already registered");
            }

            if (!data.session) {
                switchAuthTab("login");
                setAuthMessage(
                    "Account created! Check your email to confirm, then log in.",
                    "ok"
                );
            }
        }

    } catch (error) {
        setAuthMessage(friendlyError(error), "error");
    }

    setAuthLoading(false);
}


// ---------- google / reset / logout ----------

async function googleLogin() {

    const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname }
    });

    if (error) {
        setAuthMessage(
            /provider is not enabled/i.test(error.message || "")
                ? "Google login is not enabled yet in Supabase."
                : friendlyError(error),
            "error"
        );
    }
}

async function forgotPassword() {

    const email = authEmail.value.trim();

    if (!validEmail(email)) {
        authEmail.classList.add("invalid");
        setAuthMessage("Type your email first, then tap Forgot password.", "error");
        return;
    }

    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname
    });

    setAuthMessage(
        error ? friendlyError(error) : "Password reset link sent to your email.",
        error ? "error" : "ok"
    );
}

async function logout() {

    await sb.auth.signOut();

    localStorage.removeItem("wrom_sessions");
    localStorage.removeItem("wrom_history");

    location.reload();
}


// ---------- session handling ----------

function applySession(session) {

    window.WROM_TOKEN = session ? session.access_token : null;

    const emailBox = document.getElementById("profileEmail");

    if (session) {
        authScreen.classList.add("hidden");
        if (emailBox) emailBox.textContent = session.user.email;
    } else {
        authScreen.classList.remove("hidden");
        if (emailBox) emailBox.textContent = "";
    }
}

sb.auth.getSession().then(({ data }) => applySession(data.session));

sb.auth.onAuthStateChange(async (event, session) => {

    applySession(session);

    if (event === "PASSWORD_RECOVERY") {

        const newPassword = prompt("Enter your new password (min 6 characters):");

        if (newPassword && newPassword.length >= 6) {

            const { error } = await sb.auth.updateUser({ password: newPassword });

            showNotice(error ? error.message : "Password updated.");
        }
    }
});

[authEmail, authPassword, authConfirm].forEach(el => {
    el.addEventListener("keydown", event => {
        if (event.key === "Enter") submitAuth();
    });
});

switchAuthTab("login");
