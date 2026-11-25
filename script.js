// ============================================
// WROM GPT V3 - script.js
// SUPABASE + GEMINI + MEMORY + MEDIA + LOGIN
// ============================================

// ---------- ELEMENTS ----------
const input = document.getElementById("userInput");
const chat = document.getElementById("chat");
const welcome = document.getElementById("welcome");

const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const videoInput = document.getElementById("videoInput");
const fileInput = document.getElementById("fileInput");

const mediaPreview = document.getElementById("mediaPreview");
const menu = document.getElementById("menu");
const uploadMenu = document.getElementById("uploadMenu");

// ---------- SUPABASE CONFIG ----------
const SUPABASE_URL = "https://ljoptxbpueeheavgngjy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Mr5_2oU30ueMAhO5IJ1zvQ_8F-qY6LD";
const AI_ENDPOINT = SUPABASE_URL + "/functions/v1/wrom-ai";

// ---------- SYSTEM VARIABLES ----------
let aiMode = "ONLINE";
let selectedMedia = null;
let selectedImage = null;
let selectedDocument = null;
let activeTool = null;
let isSending = false;
let isLoading = false;
let recognition = null;
let formattingLibrariesPromise = null;

// ---------- DEVICE ID ----------
function getDeviceId() {
    let deviceId = localStorage.getItem("wrom_device_id");

    if (!deviceId) {
        deviceId = crypto.randomUUID
            ? crypto.randomUUID()
            : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                const v = c === "x" ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        localStorage.setItem("wrom_device_id", deviceId);
    }
    return deviceId;
}

const DEVICE_ID = getDeviceId();

// ---------- CHAT SESSIONS ----------
let sessions = [];

try {
    sessions = JSON.parse(localStorage.getItem("wrom_sessions") || "[]");
    if (!Array.isArray(sessions)) sessions = [];
} catch (error) {
    sessions = [];
}

let currentSessionId = null;
let history = [];

// migrate old history
try {
    const oldHistory = JSON.parse(localStorage.getItem("wrom_history") || "[]");

    if (sessions.length === 0 && Array.isArray(oldHistory) && oldHistory.length > 0) {
        sessions.push({
            id: Date.now().toString(),
            title: "Previous Chat",
            messages: oldHistory,
            updatedAt: Date.now()
        });
    }
} catch (error) {
    console.log("Old history unavailable.");
}

function saveSessions() {
    try {
        localStorage.setItem("wrom_sessions", JSON.stringify(sessions));
        localStorage.setItem("wrom_history", JSON.stringify(history));
    } catch (error) {
        console.error("History storage error:", error);
        showNotice("Storage is full. Please clear some old chats.");
    }
}

function createSession() {
    const session = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [],
        updatedAt: Date.now()
    };

    sessions.unshift(session);
    currentSessionId = session.id;
    history = [];

    saveSessions();
    renderHistory();

    return session;
}

function getCurrentSession() {
    return sessions.find(item => item.id === currentSessionId);
}

function updateCurrentSession() {
    let session = getCurrentSession();

    if (!session) session = createSession();

    session.messages = history;
    session.updatedAt = Date.now();

    if (session.title === "New Chat" && history.length > 0) {
        session.title =
            history.find(item => item.role === "user")?.content?.slice(0, 35) || "New Chat";
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    saveSessions();
    renderHistory();
}

// ---------- SRI LANKA DATE & TIME ----------
function getSriLankaDateTime() {
    const now = new Date();

    const date = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    }).format(now);

    const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Colombo",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
    }).format(now);

    return { date, time, timezone: "Asia/Colombo (UTC+05:30)" };
}

// ---------- NOTIFICATION ----------
function showNotice(message) {
    let notice = document.getElementById("wromNotice");

    if (!notice) {
        notice = document.createElement("div");
        notice.id = "wromNotice";
        notice.style.cssText = `
            position:fixed; left:50%; bottom:115px; transform:translateX(-50%);
            background:#102a1c; color:#00ff88; border:1px solid #00ff88;
            border-radius:10px; padding:12px 17px; font-size:12px; z-index:3000;
            max-width:90%; text-align:center; box-shadow:0 5px 20px #000;
        `;
        document.body.appendChild(notice);
    }

    notice.textContent = message;
    notice.style.display = "block";

    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => { notice.style.display = "none"; }, 3000);
}

// ---------- MODE DISPLAY ----------
function updateModeStatus() {
    const status = document.getElementById("modeStatus");
    if (!status) return;
    status.textContent = aiMode === "LOCAL" ? "LOCAL DEMO MODE" : "ONLINE AI MODE";
}

updateModeStatus();

// ---------- SIDEBAR / PROFILE ----------
function toggleMenu() {
    if (menu) menu.classList.toggle("show");
}

function closeMenu() {
    if (menu) menu.classList.remove("show");
}

function toggleProfile() {
    const profile = document.getElementById("profileMenu");
    if (profile) profile.classList.toggle("show");
}

function toggleMode() {
    aiMode = aiMode === "LOCAL" ? "ONLINE" : "LOCAL";
    updateModeStatus();
    showNotice(aiMode === "ONLINE" ? "ONLINE AI MODE ACTIVATED" : "LOCAL DEMO MODE ACTIVATED");
    closeMenu();
}

// ---------- DISPLAY CHAT ----------
function displayChat() {
    if (welcome) welcome.style.display = "none";
    if (chat) chat.style.display = "flex";
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

// ---------- FORMATTING LIBRARIES ----------
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-wrom-src="${src}"]`);

        if (existing) {
            if (existing.dataset.loaded === "true") { resolve(); return; }
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.wromSrc = src;
        script.onload = () => { script.dataset.loaded = "true"; resolve(); };
        script.onerror = () => reject(new Error("Could not load formatting library."));
        document.head.appendChild(script);
    });
}

function loadStyle(href) {
    if (document.querySelector(`link[data-wrom-style="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.wromStyle = href;
    document.head.appendChild(link);
}

async function ensureFormattingLibraries() {
    if (formattingLibrariesPromise) return formattingLibrariesPromise;

    formattingLibrariesPromise = (async () => {
        try {
            loadStyle("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css");
            loadStyle("https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css");

            if (!window.marked) await loadScript("https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js");
            if (!window.DOMPurify) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.6/purify.min.js");
            if (!window.hljs) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js");
            if (!window.katex) await loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js");
            if (!window.renderMathInElement) await loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js");

            return true;
        } catch (error) {
            console.error("Formatting libraries could not load:", error);
            formattingLibrariesPromise = null;
            return false;
        }
    })();

    return formattingLibrariesPromise;
}

// ---------- MARKDOWN RENDERER ----------
function renderAIContent(text) {
    const container = document.createElement("div");
    container.className = "ai-content";

    const content = String(text ?? "");

    if (window.marked && window.DOMPurify) {
        try {
            const rawHTML = window.marked.parse(content, { gfm: true, breaks: true });
            const safeHTML = window.DOMPurify.sanitize(rawHTML, { USE_PROFILES: { html: true } });

            container.innerHTML = safeHTML;

            container.querySelectorAll("img").forEach(img => {
                img.loading = "lazy";
                img.referrerPolicy = "no-referrer";
                img.alt = img.alt || "image";
                img.onerror = () => img.remove();
                img.style.cursor = "zoom-in";
                img.addEventListener("click", () => openImageViewer(img.currentSrc || img.src));
            });

            container.querySelectorAll("a").forEach(link => {
                const href = link.getAttribute("href") || "";

                if (/^https?:\/\//i.test(href)) {
                    link.setAttribute("target", "_blank");
                    link.setAttribute("rel", "noopener noreferrer");
                } else {
                    link.removeAttribute("target");
                }
            });

            if (window.hljs) {
                container.querySelectorAll("pre code").forEach(block => {
                    try { window.hljs.highlightElement(block); }
                    catch (error) { console.log("Code highlighting unavailable."); }
                });
            }

            if (window.renderMathInElement) {
                try {
                    window.renderMathInElement(container, {
                        delimiters: [
                            { left: "$$", right: "$$", display: true },
                            { left: "\\[", right: "\\]", display: true },
                            { left: "$", right: "$", display: false },
                            { left: "\\(", right: "\\)", display: false }
                        ],
                        throwOnError: false
                    });
                } catch (error) {
                    console.log("Math rendering unavailable.");
                }
            }

            return container;
        } catch (error) {
            console.error("Markdown rendering error:", error);
        }
    }

    container.textContent = content;
    return container;
}

// ---------- ADD MESSAGE ----------
function addMessage(text, type, messageIndexOverride = null) {
    const message = document.createElement("div");
    message.className = "message " + type;

    const messageIndex = messageIndexOverride === null ? history.length : messageIndexOverride;

    if (type === "ai") {
        const label = document.createElement("strong");
        label.className = "ai-label";
        label.textContent = "WROM GPT";
        message.appendChild(label);
        message.appendChild(renderAIContent(text));
    } else {
        const content = document.createElement("div");
        content.className = "user-content";
        content.textContent = text;
        message.appendChild(content);
    }

    const actions = document.createElement("div");
    actions.className = "message-actions";

    if (type === "ai") {
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy";
        copy.onclick = () => copyMessageText(text);
        actions.appendChild(copy);

        const regenerate = document.createElement("button");
        regenerate.type = "button";
        regenerate.textContent = "Regenerate";
        regenerate.onclick = () => regenerateLastResponse();
        actions.appendChild(regenerate);
    } else {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.onclick = () => editUserMessage(messageIndex);
        actions.appendChild(edit);
    }

    message.appendChild(actions);

    if (!chat) return message;

    chat.appendChild(message);
    scrollToBottom();

    return message;
}

// ---------- COPY ----------
async function copyMessageText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(String(text));
        } else {
            const temp = document.createElement("textarea");
            temp.value = String(text);
            temp.style.position = "fixed";
            temp.style.opacity = "0";
            document.body.appendChild(temp);
            temp.select();
            const copied = document.execCommand("copy");
            temp.remove();
            if (!copied) throw new Error("Copy failed");
        }
        showNotice("Response copied.");
    } catch (error) {
        showNotice("Could not copy response.");
    }
}

// ---------- EDIT USER MESSAGE ----------
function editUserMessage(index) {
    const item = history[index];

    if (!item || item.role !== "user" || isSending) return;

    input.value = item.content;
    input.focus();

    history = history.slice(0, index);

    updateCurrentSession();
    redrawCurrentChat();

    showNotice("Edit the message, then send it again.");
}

// ---------- REDRAW CHAT ----------
function redrawCurrentChat() {
    if (!chat) return;

    chat.innerHTML = "";

    if (history.length) {
        displayChat();
        history.forEach((item, index) => {
            addMessage(item.content, item.role === "user" ? "user" : "ai", index);
        });
    } else {
        chat.style.display = "none";
        if (welcome) welcome.style.display = "block";
    }
}

// ---------- REGENERATE ----------
async function regenerateLastResponse() {
    if (isSending) return;

    if (!history.length || history[history.length - 1].role !== "assistant") {
        showNotice("No response to regenerate.");
        return;
    }

    history.pop();

    const lastUser = history[history.length - 1];

    if (!lastUser || lastUser.role !== "user") {
        showNotice("Could not find the last user message.");
        return;
    }

    updateCurrentSession();
    redrawCurrentChat();

    await sendMessage(true);
}

// ============================================
// WROM GPT V3 - PART 2 (MISSING FUNCTIONS)
// Paste this at the VERY END of script.js
// (after regenerateLastResponse)
// ============================================


// ============================================
// PANELS
// ============================================

function closePanels() {
    document.querySelectorAll(".side-panel").forEach(panel => {
        panel.classList.remove("show");
    });
}

function togglePanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;

    const wasOpen = panel.classList.contains("show");

    closePanels();

    const profile = document.getElementById("profileMenu");
    if (profile) profile.classList.remove("show");

    closeMenu();

    if (!wasOpen) panel.classList.add("show");
}

function showHistory() {
    renderHistory();
    togglePanel("historyPanel");
}

async function memoryRequest(payload) {

    const response = await fetch(AI_ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": "Bearer " + (window.WROM_TOKEN || SUPABASE_ANON_KEY)
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.error) {
        throw new Error(data.error || ("HTTP " + response.status));
    }

    return data;
}

async function loadMemoryPanel() {

    const box = document.getElementById("memoryContent");
    if (!box) return;

    box.textContent = "Loading memories...";

    try {
        const data = await memoryRequest({ action: "list_memories" });
        const list = data.memories || [];

        box.innerHTML = "";

        if (!list.length) {
            box.textContent =
                "No saved memories yet. Tell WROM GPT something about you " +
                "(or say \"remember this\") and it will appear here.";
            return;
        }

        list.forEach(item => {

            const row = document.createElement("div");
            row.style.cssText =
                "display:flex;gap:10px;align-items:flex-start;margin:8px 0;" +
                "padding:11px 13px;border-radius:10px;background:#12231a;" +
                "border:1px solid rgba(160,255,190,.10);";

            const text = document.createElement("div");
            text.textContent = item.memory;
            text.style.cssText = "flex:1;font-size:13px;line-height:1.6;overflow-wrap:anywhere;";

            const del = document.createElement("button");
            del.type = "button";
            del.textContent = "Delete";
            del.style.cssText =
                "padding:5px 10px;border-radius:7px;font-size:11px;" +
                "background:rgba(255,90,90,.12);border:1px solid rgba(255,90,90,.3);" +
                "color:#ff9b9b;";

            del.onclick = async () => {

                if (!confirm("Delete this memory?")) return;

                del.disabled = true;

                try {
                    await memoryRequest({ action: "delete_memory", id: item.id });
                    row.remove();
                    showNotice("Memory deleted.");
                } catch (error) {
                    del.disabled = false;
                    showNotice("Could not delete: " + error.message);
                }
            };

            row.appendChild(text);
            row.appendChild(del);
            box.appendChild(row);
        });

    } catch (error) {
        box.textContent = "Could not load memories: " + error.message;
    }
}

function showMemory() {
    togglePanel("memoryPanel");

    const panel = document.getElementById("memoryPanel");

    if (panel && panel.classList.contains("show")) {
        loadMemoryPanel();
    }
}

function showTools() {
    togglePanel("toolsPanel");
}

function showSettings() {
    togglePanel("settingsPanel");
}

function selectTool(tool) {
    activeTool = tool;
    showNotice(tool.toUpperCase() + " tool selected (coming soon).");
    closePanels();
}


// ============================================
// CHAT HISTORY PANEL
// ============================================

function renderHistory(filter) {

    const list = document.getElementById("historyPanelList");
    if (!list) return;

    const q = String(filter || "").trim().toLowerCase();

    const items = sessions.filter(session => {

        if (!session.messages || session.messages.length === 0) {
            return false;
        }

        if (!q) return true;

        return (
            String(session.title || "").toLowerCase().includes(q) ||
            session.messages.some(m =>
                String(m.content || "").toLowerCase().includes(q)
            )
        );
    });

    list.innerHTML = "";

    if (!items.length) {
        list.textContent = q
            ? "No chats found."
            : "No saved chats yet.";
        return;
    }

    items.forEach(session => {

        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;margin:7px 0;";

        const open = document.createElement("button");
        open.type = "button";
        open.textContent = session.title || "New Chat";
        open.style.cssText =
            "flex:1;text-align:left;padding:13px;border-radius:10px;" +
            "background:#12231a;overflow:hidden;text-overflow:ellipsis;" +
            "white-space:nowrap;";
        open.onclick = () => loadSession(session.id);

        const del = document.createElement("button");
        del.type = "button";
        del.innerHTML = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>';
        del.style.cssText =
            "padding:0 13px;border-radius:10px;background:#12231a;";
        del.onclick = () => deleteSession(session.id);

        row.appendChild(open);
        row.appendChild(del);
        list.appendChild(row);
    });
}

function searchChats(value) {
    renderHistory(value);
}

function loadSession(id) {

    const session = sessions.find(item => item.id === id);
    if (!session) return;

    currentSessionId = session.id;
    history = session.messages;

    redrawCurrentChat();
    closePanels();
}

function deleteSession(id) {

    sessions = sessions.filter(item => item.id !== id);

    if (currentSessionId === id) {
        currentSessionId = null;
        history = [];
        redrawCurrentChat();
    }

    saveSessions();
    renderHistory();
}


// ============================================
// NEW CHAT / CLEAR CHAT
// ============================================

function clearMedia() {
    selectedMedia = null;
    selectedImage = null;
    selectedDocument = null;

    [imageInput, audioInput, videoInput, fileInput].forEach(el => {
        if (el) el.value = "";
    });

    if (mediaPreview) {
        mediaPreview.style.display = "none";
        mediaPreview.innerHTML = "";
    }
}

function newChat() {

    currentSessionId = null;
    history = [];

    clearMedia();
    redrawCurrentChat();

    if (input) input.value = "";

    closePanels();
    closeMenu();

    const profile = document.getElementById("profileMenu");
    if (profile) profile.classList.remove("show");
}

function clearChat() {

    history = [];

    const session = getCurrentSession();

    if (session) {
        session.messages = history;
        session.title = "New Chat";
        session.updatedAt = Date.now();
        saveSessions();
        renderHistory();
    }

    clearMedia();
    redrawCurrentChat();
    closeMenu();

    showNotice("Chat cleared.");
}


// ============================================
// SUGGESTIONS
// ============================================

function useSuggestion(text) {
    if (!input) return;
    input.value = text;
    sendMessage();
}


// ============================================
// UPLOADS
// ============================================

function toggleUploadMenu() {
    if (uploadMenu) uploadMenu.classList.toggle("show");
}

function readFileAs(file, mode) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("File read failed."));

        if (mode === "text") {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
}

function showMediaPreview(name, dataUrl, isImage) {

    if (!mediaPreview) return;

    mediaPreview.innerHTML = "";
    mediaPreview.style.display = "block";

    if (isImage && dataUrl) {
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.cssText =
            "max-height:80px;border-radius:8px;display:block;margin-bottom:6px;";
        mediaPreview.appendChild(img);
    }

    const label = document.createElement("span");
    label.textContent = "Attached: " + name + "  ";
    label.style.fontSize = "12px";
    mediaPreview.appendChild(label);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "✕";
    remove.style.cssText = "background:transparent;font-size:14px;";
    remove.onclick = clearMedia;
    mediaPreview.appendChild(remove);
}

async function handleMediaFile(file) {

    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
        showNotice("File is too large (max 12MB).");
        return;
    }

    try {
        const dataUrl = await readFileAs(file, "dataurl");

        selectedDocument = null;

        selectedMedia = {
            mimeType: file.type,
            data: dataUrl.split(",")[1]
        };

        showMediaPreview(
            file.name,
            dataUrl,
            file.type.startsWith("image/")
        );

    } catch (error) {
        showNotice("Could not read the file.");
    }

    if (uploadMenu) uploadMenu.classList.remove("show");
}

async function handleDocumentFile(file) {

    if (!file) return;

    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        showNotice("PDF is not supported yet. Use TXT, CSV or JSON.");
        return;
    }

    if (file.size > 1024 * 1024) {
        showNotice("Document is too large (max 1MB).");
        return;
    }

    try {
        const text = await readFileAs(file, "text");

        selectedMedia = null;

        selectedDocument = {
            name: file.name,
            text: text
        };

        showMediaPreview(file.name, null, false);

    } catch (error) {
        showNotice("Could not read the file.");
    }

    if (uploadMenu) uploadMenu.classList.remove("show");
}

if (imageInput) imageInput.addEventListener("change", e => handleMediaFile(e.target.files[0]));
if (audioInput) audioInput.addEventListener("change", e => handleMediaFile(e.target.files[0]));
if (videoInput) videoInput.addEventListener("change", e => handleMediaFile(e.target.files[0]));
if (fileInput) fileInput.addEventListener("change", e => handleDocumentFile(e.target.files[0]));


// ============================================
// VOICE INPUT
// ============================================

function startVoiceInput() {

    const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    const button = document.getElementById("voiceBtn");

    if (!SpeechRecognition) {
        showNotice("Voice input is not supported in this browser.");
        return;
    }

    if (recognition) {
        recognition.stop();
        return;
    }

    recognition = new SpeechRecognition();

    recognition.lang = "en-US"; // change to "si-LK" for Sinhala
    recognition.interimResults = false;

    recognition.onstart = () => {
        if (button) button.classList.add("recording");
    };

    recognition.onresult = event => {
        const spoken = event.results[0][0].transcript;
        input.value = (input.value ? input.value + " " : "") + spoken;
        input.focus();
    };

    recognition.onerror = () => {
        showNotice("Voice input failed.");
    };

    recognition.onend = () => {
        if (button) button.classList.remove("recording");
        recognition = null;
    };

    recognition.start();
}


// ============================================
// TEXTAREA BEHAVIOUR
// ============================================

if (input) {

    input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    input.addEventListener("keydown", event => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            window.innerWidth > 800
        ) {
            event.preventDefault();
            sendMessage();
        }
    });
}


// ============================================
// SEND MESSAGE
// ============================================

async function sendMessage(isRegenerate) {

    if (isSending) return;

    const regenerating = isRegenerate === true;

    let media = null;

    if (!regenerating) {

        let text = input.value.trim();

        if (!text && !selectedMedia && !selectedDocument) return;

        let shown = text;

        if (selectedDocument) {
            shown = (text || "Please analyze this file.") +
                "\n[Attached: " + selectedDocument.name + "]";

            text = (text || "Please analyze this file.") +
                "\n\n[File: " + selectedDocument.name + "]\n" +
                selectedDocument.text.slice(0, 30000);

        } else if (selectedMedia) {
            if (!text) text = "Please analyze this file.";
            shown = text + "\n[Media attached]";
        }

        media = selectedMedia;

        if (!getCurrentSession()) {
            createSession();
        }

        displayChat();

        addMessage(shown, "user");

        history.push({
            role: "user",
            content: text
        });

        updateCurrentSession();

        input.value = "";
        input.style.height = "auto";

        clearMedia();

    } else {
        displayChat();
    }

    isSending = true;

    const sendBtn = document.getElementById("sendBtn");
    if (sendBtn) sendBtn.disabled = true;

    const loading = document.createElement("div");
    loading.className = "message ai";
    loading.textContent = "WROM GPT is thinking...";
    chat.appendChild(loading);

    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth"
    });

    try {

        let reply;

        if (aiMode === "LOCAL") {

            await new Promise(r => setTimeout(r, 600));

            reply = "This is LOCAL DEMO MODE. Switch to ONLINE mode " +
                "from the menu to talk to the real AI.";

        } else {

            const response = await fetch(AI_ENDPOINT, {

                method: "POST",

                signal: AbortSignal.timeout(70000),

                headers: {
                    "Content-Type": "application/json",
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": "Bearer " + (window.WROM_TOKEN || SUPABASE_ANON_KEY)
                },

                body: JSON.stringify({
                    messages: history.map(item => ({
                        role: item.role,
                        content: item.content
                    })),
                    deviceId: DEVICE_ID,
                    media: media
                })
            });

            let data = {};

            try {
                data = await response.json();
            } catch (e) {
                data = {};
            }

            if (!response.ok || data.error) {
                throw new Error(
                    data.details ||
                    data.error ||
                    data.message ||
                    ("HTTP " + response.status)
                );
            }

            reply = data.reply;

            if (data.savedMemories > 0) {
                showNotice("Memory saved");
            }
        }

        await ensureFormattingLibraries();

        loading.remove();

        addMessage(reply, "ai");

        history.push({
            role: "assistant",
            content: reply
        });

        updateCurrentSession();

    } catch (error) {

        console.error("Send error:", error);

        loading.remove();

        const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");

        addMessage(
            timedOut
                ? "Error: The server took too long to respond. Please try again."
                : "Error: " + error.message,
            "ai"
        );

    } finally {

        isSending = false;

        if (sendBtn) sendBtn.disabled = false;

        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth"
        });
    }
}


// ============================================
// IMAGE VIEWER (tap an image to open / save)
// ============================================

function closeImageViewer() {
    const viewer = document.getElementById("imageViewer");
    if (viewer) viewer.remove();
}

function openImageViewer(src) {

    closeImageViewer();

    const viewer = document.createElement("div");
    viewer.id = "imageViewer";
    viewer.className = "image-viewer";

    const img = document.createElement("img");
    img.src = src;
    img.referrerPolicy = "no-referrer";
    img.alt = "image";

    const bar = document.createElement("div");
    bar.className = "image-viewer-bar";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.onclick = () => saveViewerImage(src);

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Open";
    open.onclick = () => window.open(src, "_blank", "noopener");

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.onclick = closeImageViewer;

    bar.appendChild(save);
    bar.appendChild(open);
    bar.appendChild(close);

    viewer.appendChild(img);
    viewer.appendChild(bar);

    // tap the dark background to close
    viewer.addEventListener("click", event => {
        if (event.target === viewer) closeImageViewer();
    });

    document.body.appendChild(viewer);
}

async function saveViewerImage(src) {

    try {
        const response = await fetch(src, { mode: "cors" });

        if (!response.ok) throw new Error("Download failed");

        const blob = await response.blob();

        const ext = blob.type.includes("png") ? ".png"
            : blob.type.includes("webp") ? ".webp"
            : blob.type.includes("gif") ? ".gif"
            : ".jpg";

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = "wrom-gpt-image" + ext;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 2000);

        showNotice("Image saved.");

    } catch (error) {

        // Some websites block direct downloads: open it so it can be saved manually
        window.open(src, "_blank", "noopener");

        showNotice("Opened the image. Press and hold it to save.");
    }
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeImageViewer();
});
