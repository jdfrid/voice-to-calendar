const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/tasks"
].join(" ");

const state = {
  token: "",
  tokenClient: null,
  latest: null,
  lastAnalyzedText: "",
  recognition: null,
  isListening: false,
  googleReady: false
};

const els = {
  input: document.querySelector("#messageInput"),
  listen: document.querySelector("#listenButton"),
  analyze: document.querySelector("#analyzeButton"),
  clear: document.querySelector("#clearButton"),
  status: document.querySelector("#speechStatus"),
  visualizer: document.querySelector(".visualizer"),
  intent: document.querySelector("#intentPill"),
  confidence: document.querySelector("#confidencePill"),
  details: document.querySelector("#detailsList"),
  results: document.querySelector(".result-grid"),
  action: document.querySelector("#actionArea"),
  clientId: document.querySelector("#clientIdInput"),
  origin: document.querySelector("#originInput"),
  copyOrigin: document.querySelector("#copyOriginButton"),
  saveConfig: document.querySelector("#saveConfigButton"),
  connect: document.querySelector("#connectButton"),
  oauthStatus: document.querySelector("#oauthStatus"),
  connectionDot: document.querySelector("#connectionDot"),
  connectionText: document.querySelector("#connectionText")
};

init();

function init() {
  els.clientId.value = localStorage.getItem("googleClientId") || "";
  els.origin.value = window.location.origin;
  setupSpeech();
  bindEvents();
  preloadGoogleIdentity();
  updateOAuthHint();
  renderEmpty();
}

function bindEvents() {
  els.listen.addEventListener("click", toggleListening);
  els.analyze.addEventListener("click", () => analyzeAndRender(els.input.value, { scroll: true }));
  els.clear.addEventListener("click", clearAll);
  els.saveConfig.addEventListener("click", saveConfig);
  els.connect.addEventListener("click", connectGoogle);
  els.clientId.addEventListener("input", updateOAuthHint);
  els.copyOrigin.addEventListener("click", copyOrigin);
}

function setupSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.listen.disabled = true;
    els.status.textContent = "הדפדפן הזה לא תומך בזיהוי דיבור. אפשר להקליד ידנית.";
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = "he-IL";
  state.recognition.interimResults = true;
  state.recognition.continuous = false;

  state.recognition.onstart = () => setListening(true);
  state.recognition.onend = () => {
    setListening(false);
    analyzeCurrentInput();
  };
  state.recognition.onerror = event => {
    els.status.textContent = `שגיאת זיהוי דיבור: ${event.error}`;
    setListening(false);
  };
  state.recognition.onresult = event => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join(" ")
      .trim();
    els.input.value = transcript;
    if (event.results[event.results.length - 1].isFinal) {
      analyzeAndRender(transcript, { scroll: true });
    }
  };
}

function toggleListening() {
  if (!state.recognition) return;
  if (state.isListening) {
    state.recognition.stop();
  } else {
    state.recognition.start();
  }
}

function setListening(isListening) {
  state.isListening = isListening;
  els.visualizer.classList.toggle("listening", isListening);
  els.listen.title = isListening ? "עצור הקלטה" : "התחל הקלטה";
  els.status.textContent = isListening ? "מקשיב..." : "אפשר לדבר בעברית או להקליד ידנית.";
}

function analyzeCurrentInput() {
  const text = els.input.value.trim();
  if (text && text !== state.lastAnalyzedText) {
    analyzeAndRender(text, { scroll: true });
  }
}

function analyzeAndRender(rawText, options = {}) {
  const item = VoiceParser.parseMessage(rawText);
  if (!item) {
    renderEmpty();
    return;
  }

  state.lastAnalyzedText = rawText.trim();
  state.latest = item;
  renderAnalysis(state.latest);
  if (options.scroll) {
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderAnalysis(item) {
  els.intent.textContent = item.label;
  els.confidence.textContent = `${item.confidence}%`;
  els.confidence.classList.remove("muted");

  const details = item.type === "calendar"
    ? [
        ["כותרת", item.title],
        ["מועד", formatDateTime(item.start)],
        ["סיום", formatDateTime(item.end)],
        ["כתובת", item.address || "לא זוהתה"],
        ["הערות", item.notes]
      ]
    : [
        ["כותרת", item.title],
        ["יעד", "Google Tasks"],
        ["תאריך יעד", item.due ? formatDateTime(item.due) : "ללא"],
        ["הערות", item.notes]
      ];

  els.details.innerHTML = details
    .map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  els.action.innerHTML = item.type === "calendar" ? renderCalendarAction(item) : renderTaskAction(item);
  document.querySelector("#sendToGoogle")?.addEventListener("click", () => sendToGoogle(item));
}

function renderCalendarAction(item) {
  const calendarUrl = buildCalendarUrl(item);
  return `
    <p>זוהתה פגישה. אפשר לפתוח טיוטת אירוע ביומן או לשלוח ישירות אם התחברת עם Client ID.</p>
    <div class="action-buttons">
      <a class="link-button" href="${calendarUrl}" target="_blank" rel="noreferrer">פתח ביומן Google</a>
      <button id="sendToGoogle" type="button">שלח ישירות ליומן</button>
    </div>
  `;
}

function renderTaskAction(item) {
  return `
    <p>זוהתה הודעה כללית, ולכן היא מוכנה להישמר כמשימה. שליחה ישירה דורשת חיבור Google.</p>
    <div class="action-buttons">
      <button id="sendToGoogle" type="button">צור משימה ב-Google Tasks</button>
    </div>
  `;
}

function renderEmpty() {
  els.intent.textContent = "ממתין";
  els.confidence.textContent = "0%";
  els.confidence.classList.add("muted");
  els.details.innerHTML = "";
  els.action.innerHTML = "<p>כתוב או אמור הודעה כדי לראות לאן המערכת תנתב אותה.</p>";
}

function clearAll() {
  els.input.value = "";
  state.latest = null;
  state.lastAnalyzedText = "";
  renderEmpty();
}

function saveConfig() {
  const clientId = els.clientId.value.trim();
  localStorage.setItem("googleClientId", clientId);
  updateOAuthHint();
  els.status.textContent = "ההגדרות נשמרו.";
}

function connectGoogle() {
  const clientId = els.clientId.value.trim();
  if (!clientId) {
    setOAuthStatus("צריך להזין Google OAuth Client ID לפני שהחלון של Google יכול להיפתח.", "error");
    els.status.textContent = "חסר Client ID.";
    return;
  }

  localStorage.setItem("googleClientId", clientId);

  if (!state.googleReady || !window.google?.accounts?.oauth2) {
    setOAuthStatus("ספריית Google עדיין נטענת. המתן רגע ולחץ שוב על התחבר עם Google.", "error");
    els.status.textContent = "Google Identity Services עדיין לא מוכנה.";
    preloadGoogleIdentity();
    return;
  }

  setOAuthStatus("פותח חלון הרשאה של Google...", "ready");
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    error_callback: error => {
      setOAuthStatus(describeOAuthError(error), "error");
      els.status.textContent = "חלון ההרשאה לא הושלם.";
    },
    callback: response => {
      if (response.error) {
        setOAuthStatus(describeOAuthError(response), "error");
        els.status.textContent = `שגיאת התחברות: ${response.error}`;
        return;
      }
      state.token = response.access_token;
      els.connectionDot.classList.add("connected");
      els.connectionText.textContent = "מחובר לגוגל";
      setOAuthStatus("מחובר. אפשר לשלוח אירועים ומשימות ישירות.", "ready");
      els.status.textContent = "החיבור לגוגל פעיל.";
    }
  });
  state.tokenClient.requestAccessToken({ prompt: "consent" });
}

function updateOAuthHint() {
  const clientId = els.clientId.value.trim();
  if (!clientId) {
    setOAuthStatus("הדבק Client ID כדי להפעיל את חלון ההרשאה.", "");
    return;
  }

  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    setOAuthStatus("ה-Client ID נראה לא שלם. הוא אמור להסתיים ב-.apps.googleusercontent.com", "error");
    return;
  }

  if (!state.googleReady) {
    setOAuthStatus("Client ID נראה תקין. ממתין לטעינת ספריית Google...", "");
    return;
  }

  setOAuthStatus(`מוכן. ב-Google Cloud חייב להיות רשום origin מדויק: ${window.location.origin}`, "ready");
}

function setOAuthStatus(message, mode) {
  els.oauthStatus.textContent = message;
  els.oauthStatus.classList.toggle("ready", mode === "ready");
  els.oauthStatus.classList.toggle("error", mode === "error");
}

function preloadGoogleIdentity() {
  els.connect.disabled = true;
  if (window.google?.accounts?.oauth2) {
    markGoogleReady();
    return;
  }

  const existing = document.querySelector("script[data-google-identity]");
  if (existing) {
    existing.addEventListener("load", markGoogleReady, { once: true });
    existing.addEventListener("error", markGoogleLoadError, { once: true });
    waitForGoogleIdentity();
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = "true";
  script.onload = markGoogleReady;
  script.onerror = markGoogleLoadError;
  document.head.appendChild(script);
  waitForGoogleIdentity();
}

function markGoogleReady() {
  state.googleReady = true;
  els.connect.disabled = false;
  updateOAuthHint();
}

function waitForGoogleIdentity(attempt = 0) {
  if (window.google?.accounts?.oauth2) {
    markGoogleReady();
    return;
  }

  if (attempt >= 30) {
    markGoogleLoadError();
    return;
  }

  window.setTimeout(() => waitForGoogleIdentity(attempt + 1), 250);
}

function markGoogleLoadError() {
  state.googleReady = false;
  els.connect.disabled = false;
  setOAuthStatus("ספריית ההתחברות של Google לא נטענה. בדוק חיבור רשת או חסימה בדפדפן.", "error");
}

function describeOAuthError(error) {
  const type = error.type || error.error || "unknown";
  if (type === "popup_failed_to_open") {
    return "הדפדפן חסם את חלון ההרשאה. אפשר חלונות קופצים לאתר הזה ולחץ שוב.";
  }
  if (type === "popup_closed") {
    return "חלון ההרשאה נסגר לפני סיום.";
  }
  if (type === "access_denied") {
    return "Google דחתה את ההרשאה. אם האפליקציה במצב Testing, הוסף את החשבון שלך כ-Test user במסך OAuth consent.";
  }
  if (type === "invalid_client") {
    return `Google דחתה את ה-Client ID. לרוב זה קורה כשלא רשמת Authorized JavaScript origin מדויק: ${window.location.origin}`;
  }
  if (type === "idpiframe_initialization_failed") {
    return "Google לא הצליחה לאתחל התחברות בדפדפן הזה. נסה Chrome רגיל או בדוק חסימת cookies/scripts.";
  }
  return `שגיאת OAuth: ${type}`;
}

async function copyOrigin() {
  try {
    await navigator.clipboard.writeText(window.location.origin);
    setOAuthStatus(`הועתק: ${window.location.origin}`, "ready");
  } catch {
    els.origin.select();
    setOAuthStatus("לא הצלחתי להעתיק אוטומטית. אפשר לסמן ולהעתיק את הערך מהשדה.", "error");
  }
}

async function sendToGoogle(item) {
  if (!state.token) {
    els.status.textContent = "צריך להתחבר לגוגל לפני שליחה ישירה.";
    return;
  }

  try {
    if (item.type === "calendar") {
      await createCalendarEvent(item);
      els.status.textContent = "האירוע נוצר ביומן Google.";
    } else {
      await createTask(item);
      els.status.textContent = "המשימה נוצרה ב-Google Tasks.";
    }
  } catch (error) {
    els.status.textContent = `שליחה נכשלה: ${error.message}`;
  }
}

async function createCalendarEvent(item) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: googleHeaders(),
    body: JSON.stringify({
      summary: item.title,
      location: item.address,
      description: item.notes,
      start: { dateTime: item.start.toISOString() },
      end: { dateTime: item.end.toISOString() }
    })
  });
  await ensureOk(response);
}

async function createTask(item) {
  const response = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: googleHeaders(),
    body: JSON.stringify({
      title: item.title,
      notes: item.notes,
      due: item.due ? item.due.toISOString() : undefined
    })
  });
  await ensureOk(response);
}

function googleHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
    "Content-Type": "application/json"
  };
}

async function ensureOk(response) {
  if (response.ok) return;
  const body = await response.text();
  throw new Error(body || `${response.status} ${response.statusText}`);
}

function buildCalendarUrl(item) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: item.title,
    dates: `${toCalendarStamp(item.start)}/${toCalendarStamp(item.end)}`,
    details: item.notes,
    location: item.address || ""
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toCalendarStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
