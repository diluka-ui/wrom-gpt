// ============================================
// WROM GPT - PHONE ACTIONS
// The AI can only SUGGEST an action. Nothing runs
// until the user taps "Allow" on the action card.
// Load AFTER script.js and auth.js
// ============================================

(function () {
    "use strict";

    const ACTION_RE = /\[\[ACTION:\s*(\{[\s\S]*?\})\s*\]\]/g;
    const MAX_ACTIONS = 4;

    // ---------- validation helpers ----------

    function clean(value, max) {
        return String(value === undefined || value === null ? "" : value)
            .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
            .trim()
            .slice(0, max || 1000);
    }

    const phoneOk = n => /^\+?[0-9][0-9 ()-]{3,18}$/.test(n);
    const onlyDigits = n => n.replace(/\D/g, "");
    const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

    function clock(h, m) {
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }

    // ---------- apps that can be opened ----------

    const APPS = {
        youtube:   { name: "YouTube",    url: "https://www.youtube.com/",     pkg: "com.google.android.youtube",
                     search: q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) },
        whatsapp:  { name: "WhatsApp",   url: "https://wa.me/",               pkg: "com.whatsapp" },
        facebook:  { name: "Facebook",   url: "https://www.facebook.com/",    pkg: "com.facebook.katana" },
        instagram: { name: "Instagram",  url: "https://www.instagram.com/",   pkg: "com.instagram.android" },
        telegram:  { name: "Telegram",   url: "https://t.me/",                pkg: "org.telegram.messenger" },
        twitter:   { name: "X (Twitter)", url: "https://x.com/",              pkg: "com.twitter.android" },
        tiktok:    { name: "TikTok",     url: "https://www.tiktok.com/",      pkg: "com.zhiliaoapp.musically" },
        spotify:   { name: "Spotify",    url: "https://open.spotify.com/",    pkg: "com.spotify.music" },
        maps:      { name: "Google Maps", url: "https://www.google.com/maps", pkg: "com.google.android.apps.maps" },
        gmail:     { name: "Gmail",      url: "https://mail.google.com/",     pkg: "com.google.android.gm" },
        playstore: { name: "Play Store", url: "https://play.google.com/store", pkg: "com.android.vending" }
    };

    const APP_ALIASES = {
        x: "twitter", "google maps": "maps", "play store": "playstore",
        "you tube": "youtube", "whats app": "whatsapp", fb: "facebook", insta: "instagram"
    };

    // Opens the real app if it is installed, otherwise the website
    function appLaunchUrl(key, query) {

        const app = APPS[key];
        if (!app) return null;

        const target = (query && app.search) ? app.search(query) : app.url;
        const u = new URL(target);

        return "intent://" + u.host + u.pathname + u.search +
            "#Intent;scheme=https;package=" + app.pkg +
            ";S.browser_fallback_url=" + encodeURIComponent(target) + ";end";
    }

    // ---------- turn raw AI JSON into a safe action ----------

    function normalize(raw) {

        if (!raw || typeof raw.type !== "string") return null;

        const type = raw.type.toLowerCase();

        switch (type) {

            case "call": {
                const number = clean(raw.number, 20);
                if (!phoneOk(number)) return null;
                return { type, number, label: "Call " + number };
            }

            case "sms": {
                const number = clean(raw.number, 20);
                const text = clean(raw.text, 1000);
                if (!phoneOk(number)) return null;
                return {
                    type, number, text,
                    label: "Open SMS to " + number + (text ? ' with the text: "' + text + '"' : ""),
                    note: "You still press send yourself."
                };
            }

            case "whatsapp": {
                const number = onlyDigits(clean(raw.number, 20));
                const text = clean(raw.text, 1000);
                if (number.length < 8 || number.length > 15) return null;
                return {
                    type, number, text,
                    label: "Open WhatsApp chat with +" + number + (text ? ' with the text: "' + text + '"' : ""),
                    note: "You still press send yourself."
                };
            }

            case "email": {
                const to = clean(raw.to, 120);
                if (!emailOk(to)) return null;
                return {
                    type, to,
                    subject: clean(raw.subject, 200),
                    body: clean(raw.body, 2000),
                    label: "Open an email to " + to + (raw.subject ? ' with subject "' + clean(raw.subject, 200) + '"' : ""),
                    note: "You still press send yourself."
                };
            }

            case "maps": {
                const query = clean(raw.query, 200);
                if (!query) return null;
                return { type, query, label: "Search Google Maps for: " + query };
            }

            case "directions": {
                const destination = clean(raw.destination, 200);
                if (!destination) return null;
                return { type, destination, label: "Get directions to: " + destination };
            }

            case "alarm": {
                const hour = parseInt(raw.hour, 10);
                const minute = parseInt(raw.minute, 10) || 0;
                if (!(hour >= 0 && hour <= 23) || !(minute >= 0 && minute <= 59)) return null;
                return {
                    type, hour, minute,
                    text: clean(raw.label, 100) || "WROM GPT alarm",
                    label: "Open the Clock app to set an alarm for " + clock(hour, minute),
                    note: "Some phones do not allow websites to open the Clock app."
                };
            }

            case "reminder": {
                const minutes = parseFloat(raw.minutes);
                const text = clean(raw.text, 200);
                if (!(minutes > 0 && minutes <= 1440) || !text) return null;
                return {
                    type, minutes, text,
                    label: "Remind you in " + Math.round(minutes) + " min: " + text,
                    note: "The reminder works while WROM GPT stays open or in the background."
                };
            }

            case "location":
                return {
                    type, label: "Share your current GPS location with the AI",
                    note: "Your location will be sent to the AI."
                };

            case "camera":
                return { type, label: "Open the camera to show a photo to the AI" };

            case "microphone":
                return { type, label: "Start voice input (microphone)" };

            case "contacts":
                return {
                    type, label: "Pick a contact from your phone",
                    note: "The contact you pick will be sent to the AI."
                };

            case "file":
                return { type, label: "Choose a file to give to the AI" };

            case "share": {
                const text = clean(raw.text, 2000);
                if (!text) return null;
                return { type, text, label: "Share this text with another app" };
            }

            case "copy": {
                const text = clean(raw.text, 2000);
                if (!text) return null;
                return { type, text, label: "Copy this text to your clipboard" };
            }

            case "openapp": {
                let key = clean(raw.app, 30).toLowerCase();
                key = APP_ALIASES[key] || key;

                if (!APPS[key]) return null;

                const query = APPS[key].search ? clean(raw.query, 150) : "";

                return {
                    type, app: key, query,
                    label: query
                        ? "Search " + APPS[key].name + ' for: "' + query + '"'
                        : "Open the " + APPS[key].name + " app"
                };
            }

            case "notifications":
                return { type, label: "Allow WROM GPT notifications" };

            default:
                return null;
        }
    }

    // ---------- helpers to open links / talk to the chat ----------

    function openApp(url) {
        window.location.href = url;
    }

    function openWeb(url) {
        window.open(url, "_blank", "noopener");
    }

    function sendToAI(text) {
        if (!input) return;
        input.value = text;
        sendMessage();
    }

    // ---------- reminders (saved on this phone) ----------

    const REMINDER_KEY = "wrom_reminders";

    function readReminders() {
        try {
            const list = JSON.parse(localStorage.getItem(REMINDER_KEY) || "[]");
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function writeReminders(list) {
        try { localStorage.setItem(REMINDER_KEY, JSON.stringify(list)); } catch (e) {}
    }

    function showReminderBanner(text, missed) {

        const banner = document.createElement("div");

        banner.style.cssText =
            "position:fixed;top:14px;left:50%;transform:translateX(-50%);" +
            "z-index:5000;max-width:92%;padding:14px 16px;border-radius:14px;" +
            "background:#102a1c;border:1px solid #36e68a;color:#a2ffc4;" +
            "font-size:13px;box-shadow:0 8px 30px #000;display:flex;gap:12px;align-items:center;";

        const label = document.createElement("div");
        label.textContent = (missed ? "Missed reminder: " : "Reminder: ") + text;

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "OK";
        close.style.cssText =
            "padding:6px 12px;border-radius:8px;background:#36e68a;color:#06140b;font-weight:bold;";
        close.onclick = () => banner.remove();

        banner.appendChild(label);
        banner.appendChild(close);
        document.body.appendChild(banner);
    }

    function fireReminder(reminder, missed) {

        writeReminders(readReminders().filter(r => r.id !== reminder.id));

        showReminderBanner(reminder.text, missed);

        if (navigator.vibrate) navigator.vibrate([300, 150, 300]);

        try {
            if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
                navigator.serviceWorker.ready.then(reg =>
                    reg.showNotification("WROM GPT reminder", {
                        body: reminder.text,
                        icon: "icon-192.png",
                        vibrate: [300, 150, 300]
                    })
                );
            }
        } catch (e) {}
    }

    function scheduleReminder(reminder) {

        const wait = reminder.at - Date.now();

        if (wait <= 0) {
            fireReminder(reminder, true);
            return;
        }

        // setTimeout supports up to ~24 days, reminders are max 24 hours
        setTimeout(() => fireReminder(reminder, false), wait);
    }

    readReminders().forEach(scheduleReminder);


    // ---------- run one action (only after the user taps Allow) ----------

    async function runAction(action) {

        switch (action.type) {

            case "call":
                openApp("tel:" + action.number.replace(/[^\d+]/g, ""));
                break;

            case "sms":
                openApp("sms:" + action.number.replace(/[^\d+]/g, "") +
                    (action.text ? "?body=" + encodeURIComponent(action.text) : ""));
                break;

            case "whatsapp":
                openWeb("https://wa.me/" + action.number +
                    (action.text ? "?text=" + encodeURIComponent(action.text) : ""));
                break;

            case "email":
                openApp("mailto:" + action.to + "?subject=" + encodeURIComponent(action.subject) +
                    "&body=" + encodeURIComponent(action.body));
                break;

            case "maps":
                openWeb("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(action.query));
                break;

            case "directions":
                openWeb("https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(action.destination));
                break;

            case "alarm":
                openApp(
                    "intent:#Intent;action=android.intent.action.SET_ALARM;" +
                    "i.android.intent.extra.alarm.HOUR=" + action.hour + ";" +
                    "i.android.intent.extra.alarm.MINUTES=" + action.minute + ";" +
                    "S.android.intent.extra.alarm.MESSAGE=" + encodeURIComponent(action.text) + ";end"
                );
                showNotice("If the Clock app did not open, please set the alarm manually.");
                break;

            case "reminder": {
                const reminder = {
                    id: Date.now() + "-" + Math.random().toString(16).slice(2),
                    at: Date.now() + action.minutes * 60000,
                    text: action.text
                };

                writeReminders(readReminders().concat(reminder));
                scheduleReminder(reminder);

                showNotice("Reminder set for " + Math.round(action.minutes) + " min.");

                if ("Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission();
                }
                break;
            }

            case "location": {
                if (!navigator.geolocation) {
                    showNotice("Location is not supported here.");
                    break;
                }

                navigator.geolocation.getCurrentPosition(
                    pos => {
                        const lat = pos.coords.latitude.toFixed(5);
                        const lng = pos.coords.longitude.toFixed(5);
                        const acc = Math.round(pos.coords.accuracy);

                        sendToAI(
                            "My current location: " + lat + ", " + lng +
                            " (accuracy about " + acc + " m). " +
                            "https://www.google.com/maps?q=" + lat + "," + lng
                        );
                    },
                    error => {
                        showNotice(error.code === 1
                            ? "Location permission was denied."
                            : "Could not get your location.");
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
                );
                break;
            }

            case "camera": {
                const picker = document.createElement("input");
                picker.type = "file";
                picker.accept = "image/*";
                picker.setAttribute("capture", "environment");

                picker.onchange = () => {
                    if (picker.files && picker.files[0]) {
                        handleMediaFile(picker.files[0]);
                        showNotice("Photo ready. Type your question and press send.");
                        input.focus();
                    }
                };

                picker.click();
                break;
            }

            case "microphone":
                startVoiceInput();
                break;

            case "contacts": {
                if (!("contacts" in navigator) || !("ContactsManager" in window)) {
                    showNotice("The contact picker is not supported on this phone.");
                    break;
                }

                const picked = await navigator.contacts.select(["name", "tel"], { multiple: false });

                if (!picked.length) break;

                const contact = picked[0];
                const name = (contact.name && contact.name[0]) || "Unknown";
                const tel = (contact.tel && contact.tel[0]) || "no number";

                sendToAI("I picked this contact: " + name + ", " + tel);
                break;
            }

            case "file":
                document.getElementById("fileInput").click();
                break;

            case "share":
                if (navigator.share) {
                    await navigator.share({ text: action.text });
                } else {
                    showNotice("Sharing is not supported here.");
                }
                break;

            case "copy":
                await navigator.clipboard.writeText(action.text);
                showNotice("Copied.");
                break;

            case "openapp": {
                const url = appLaunchUrl(action.app, action.query);
                if (url) openApp(url);
                break;
            }

            case "notifications": {
                if (!("Notification" in window)) {
                    showNotice("Notifications are not supported here.");
                    break;
                }

                const result = await Notification.requestPermission();
                showNotice(result === "granted" ? "Notifications allowed." : "Notifications not allowed.");
                break;
            }
        }
    }


    // ---------- action cards ----------

    function buildCards(actions) {

        const wrap = document.createElement("div");
        wrap.className = "action-cards";

        actions.forEach(action => {

            const card = document.createElement("div");
            card.className = "action-card";

            const tag = document.createElement("div");
            tag.className = "action-tag";
            tag.textContent = "SUGGESTED BY AI";

            const label = document.createElement("div");
            label.className = "action-label";
            label.textContent = action.label;

            card.appendChild(tag);
            card.appendChild(label);

            if (action.note) {
                const note = document.createElement("div");
                note.className = "action-note";
                note.textContent = action.note;
                card.appendChild(note);
            }

            const buttons = document.createElement("div");
            buttons.className = "action-buttons";

            const allow = document.createElement("button");
            allow.type = "button";
            allow.className = "action-allow";
            allow.textContent = "Allow";

            const dismiss = document.createElement("button");
            dismiss.type = "button";
            dismiss.className = "action-dismiss";
            dismiss.textContent = "Dismiss";

            allow.onclick = async () => {
                allow.disabled = true;

                try {
                    await runAction(action);
                    card.classList.add("done");
                    buttons.textContent = "Done";
                } catch (error) {
                    allow.disabled = false;
                    showNotice("Could not complete: " + (error && error.message ? error.message : "error"));
                }
            };

            dismiss.onclick = () => card.remove();

            buttons.appendChild(allow);
            buttons.appendChild(dismiss);
            card.appendChild(buttons);
            wrap.appendChild(card);
        });

        return wrap;
    }


    // ---------- hook into the chat ----------

    function extract(text) {

        const actions = [];

        const cleaned = String(text === undefined || text === null ? "" : text)
            .replace(ACTION_RE, (match, json) => {

                if (actions.length < MAX_ACTIONS) {
                    try {
                        const action = normalize(JSON.parse(json));
                        if (action) actions.push(action);
                    } catch (e) {}
                }

                return "";
            })
            .trim();

        return { cleaned, actions };
    }

    // ---------- quick commands: typed by the user, run instantly ----------
    // "open youtube", "youtube eka open karanna", "call 0771234567"
    // The user typed it, so no confirmation card is needed.

    const QUICK_WORDS = {
        youtube: ["youtube", "you tube"], whatsapp: ["whatsapp", "whats app"],
        facebook: ["facebook"], instagram: ["instagram"], telegram: ["telegram"],
        twitter: ["twitter"], tiktok: ["tiktok", "tik tok"], spotify: ["spotify"],
        maps: ["google maps", "maps"], gmail: ["gmail"], playstore: ["play store", "playstore"]
    };

    function parseQuickCommand(text) {

        const t = String(text || "").toLowerCase().trim();

        if (!t || t.length > 50) return null;
        if (/\?|\b(how|why|what|when|which|where|kohomada|mokakda|mokada)\b/.test(t)) return null;

        const call = t.match(/^(call|dial)\s+(\+?[0-9][0-9\s()-]{3,18})$/);

        if (call) {
            const number = call[2].trim();
            return phoneOk(number) ? { type: "call", number } : null;
        }

        if (!/\b(open|launch|start)\b/.test(t)) return null;

        for (const key of Object.keys(QUICK_WORDS)) {
            if (QUICK_WORDS[key].some(word => t.includes(word))) {
                return { type: "openapp", app: key, query: "" };
            }
        }

        return null;
    }

    const originalSend = window.sendMessage;

    window.sendMessage = function (isRegenerate) {

        if (isRegenerate !== true && input && !selectedMedia && !selectedDocument) {

            const command = parseQuickCommand(input.value);

            if (command) {
                input.value = "";
                input.style.height = "auto";

                showNotice(command.type === "call"
                    ? "Opening the dialer..."
                    : "Opening " + APPS[command.app].name + "...");

                runAction(command);
                return;
            }
        }

        return originalSend.apply(this, arguments);
    };

    const originalRender = window.renderAIContent;

    window.renderAIContent = function (text) {

        const { cleaned, actions } = extract(text);

        const container = originalRender(cleaned);

        if (actions.length) {
            container.appendChild(buildCards(actions));
        }

        return container;
    };

    const originalCopy = window.copyMessageText;

    window.copyMessageText = function (text) {
        return originalCopy(extract(text).cleaned);
    };

})();
