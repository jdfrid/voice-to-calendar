// ===== Utilities =====
const pad = n => String(n).padStart(2,'0');
const tz = () => (localStorage.getItem('vtc_tz') || 'Asia/Jerusalem');

function toRFC3339Local(d){
  // returns e.g. 2025-09-01T10:00:00+03:00
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(offMin)/60));
  const mm = pad(Math.abs(offMin)%60);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

// ===== Parsing (simple Hebrew) =====
function parseText(t){
  const now = new Date();
  let content = t;
  let date = now.toLocaleDateString('he-IL');
  let time = "09:00";
  let location = "";

  if(/מחר/.test(t)){
    const d = new Date(now); d.setDate(d.getDate()+1);
    date = d.toLocaleDateString('he-IL');
  }
  const timeMatch = t.match(/(\d{1,2})[:.](\d{2})/);
  if(timeMatch){ time = timeMatch[0].replace('.',':'); }
  const locMatch = t.match(/\bב[א-ת][^ ,.\n]{0,40}/);
  if(locMatch){ location = locMatch[0]; }
  content = content.replace(/מחר|בשעה.*|ב[א-ת]+/g,"").trim();
  return {content,date,time,location};
}

// ===== ICS + Google Template =====
function buildICS(ev){
  const [dd,mm,yyyy] = ev.date.split('.');
  const [hh,min] = ev.time.split(':');
  const start = new Date(yyyy,mm-1,dd,hh,min);
  const end = new Date(start.getTime()+60*60*1000);
  function fmtICS(d){return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';}
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${ev.content}
DTSTART:${fmtICS(start)}
DTEND:${fmtICS(end)}
LOCATION:${ev.location}
END:VEVENT
END:VCALENDAR`;
  return { ics, start, end };
}

function googleTemplateUrl(title, start, end, location){
  const p = new URLSearchParams();
  const toLocal = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  p.set('action','TEMPLATE');
  p.set('text', title || '');
  p.set('dates', `${toLocal(start)}/${toLocal(end)}`);
  if(location) p.set('location', location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ===== Google OAuth + Calendar API (client-side) =====
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
let tokenClient = null;
let accessToken = null;

function loadSettings(){
  const clientId = localStorage.getItem('vtc_client_id') || '';
  const calendarId = localStorage.getItem('vtc_calendar_id') || 'primary';
  const timezone = localStorage.getItem('vtc_tz') || 'Asia/Jerusalem';
  return { clientId, calendarId, timezone };
}

function saveSettings({clientId, calendarId, timezone}){
  if(clientId) localStorage.setItem('vtc_client_id', clientId);
  if(calendarId) localStorage.setItem('vtc_calendar_id', calendarId);
  if(timezone) localStorage.setItem('vtc_tz', timezone);
}

function ensureToken(onReady){
  const { clientId } = loadSettings();
  if(!clientId){ alert('חסר OAuth Client ID. פתח הגדרות (⚙️) והדבק Client ID.'); return; }
  if(accessToken){ onReady(); return; }
  if(!window.google || !google.accounts || !google.accounts.oauth2){
    alert('ספריית Google Identity עדיין נטענת. נסו שוב בעוד רגע.');
    return;
  }
  if(!tokenClient){
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => {
        if(resp && resp.access_token){
          accessToken = resp.access_token;
          const s = document.getElementById('gStatus');
          s.textContent = 'מחובר לגוגל ✓';
          onReady();
        } else {
          alert('קבלת אסימון נכשלה');
        }
      }
    });
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

async function insertToCalendar(ev){
  const { calendarId, timezone } = loadSettings();
  // convert to Date from dd.mm.yyyy
  const [dd,mm,yyyy] = ev.date.split('.');
  const [hh,min] = ev.time.split(':');
  const start = new Date(yyyy,mm-1,dd,hh,min);
  const end = new Date(start.getTime()+60*60*1000);

  const body = {
    summary: ev.content || 'פגישה',
    location: ev.location || undefined,
    start: { dateTime: toRFC3339Local(start), timeZone: timezone },
    end: { dateTime: toRFC3339Local(end), timeZone: timezone },
    // ניתן להרחיב: recurrence, reminders.overrides וכו'
    reminders: { useDefault: true }
  };

  const s = document.getElementById('gStatus');
  s.textContent = 'שולח אירוע ליומן…';

  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if(!resp.ok){
    const txt = await resp.text();
    s.textContent = '';
    alert('שגיאה בשליחה ליומן: ' + txt);
    return;
  }
  const json = await resp.json();
  s.innerHTML = `נוצר אירוע ✓ <a class="underline text-blue-700" target="_blank" rel="noreferrer" href="${json.htmlLink}">פתח ביומן</a>`;
}

// ===== DOM Wiring =====
const btnParse = document.getElementById('btnParse');
const btnRecord = document.getElementById('btnRecord');
const recIndicator = document.getElementById('recIndicator');
const interimBox = document.getElementById('interimBox');
const interimText = document.getElementById('interimText');
const srInfo = document.getElementById('srSupport');
const btnSettings = document.getElementById('btnSettings');
const dlgSettings = document.getElementById('dlgSettings');
const fldClientId = document.getElementById('fldClientId');
const fldCalendarId = document.getElementById('fldCalendarId');
const fldTz = document.getElementById('fldTz');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnGLogin = document.getElementById('btnGLogin');
const btnGInsert = document.getElementById('btnGInsert');
const btnGTemplate = document.getElementById('btnGTemplate');

// settings init
(function initSettings(){
  const s = loadSettings();
  fldClientId.value = s.clientId;
  fldCalendarId.value = s.calendarId;
  fldTz.value = s.timezone;
})();

btnSettings.onclick = () => dlgSettings.showModal();
btnSaveSettings.onclick = (e) => {
  e.preventDefault();
  saveSettings({ clientId: fldClientId.value.trim(), calendarId: fldCalendarId.value.trim() || 'primary', timezone: fldTz.value.trim() || 'Asia/Jerusalem' });
  dlgSettings.close();
};

btnGLogin.onclick = () => ensureToken(()=>{});

// parse flow
document.getElementById("btnParse").onclick=()=>{
  const txt=document.getElementById("txt").value;
  const ev=parseText(txt);
  document.getElementById("parsed").classList.remove("hidden");
  document.getElementById("outContent").textContent=ev.content;
  document.getElementById("outDate").textContent=ev.date;
  document.getElementById("outTime").textContent=ev.time;
  document.getElementById("outLocation").textContent=ev.location;
  document.getElementById("btnDownload").onclick=()=>{
    const { ics, start, end } = buildICS(ev);
    const blob=new Blob([ics],{type:'text/calendar'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download="event.ics"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  // template url
  const { ics, start, end } = buildICS(ev);
  btnGTemplate.href = googleTemplateUrl(ev.content, start, end, ev.location);
  btnGInsert.onclick = () => ensureToken(()=> insertToCalendar(ev));
};

// SpeechRecognition
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let recording = false;

(function initSR(){
  if (!window.SpeechRecognition) {
    srInfo.textContent = "הדפדפן לא תומך בזיהוי דיבור. מומלץ Chrome עדכני ובחיבור HTTPS.";
    btnRecord.disabled = true;
    btnRecord.classList.add('opacity-60','cursor-not-allowed');
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "he-IL";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recording = true;
    recIndicator.classList.remove('hidden');
    interimBox.classList.remove('hidden');
    interimText.textContent = "";
    btnRecord.textContent = "⏹️ עצור";
    btnRecord.setAttribute('aria-pressed','true');
    btnRecord.classList.add('pressed');
    btnRecord.classList.remove('bg-red-600');
    btnRecord.classList.add('bg-gray-700');
    btnParse.disabled = true;
    btnParse.classList.add('opacity-60','cursor-not-allowed');
  };

  recognition.onend = () => {
    recording = false;
    recIndicator.classList.add('hidden');
    btnRecord.textContent = "🎙️ הקלט";
    btnRecord.setAttribute('aria-pressed','false');
    btnRecord.classList.remove('pressed');
    btnRecord.classList.remove('bg-gray-700');
    btnRecord.classList.add('bg-red-600');
    btnParse.disabled = false;
    btnParse.classList.remove('opacity-60','cursor-not-allowed');
  };

  recognition.onresult = (event) => {
    let live = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      live += res[0].transcript + " ";
      if (res.isFinal) {
        const current = document.getElementById("txt").value.trim();
        const combined = (current + " " + res[0].transcript).trim();
        document.getElementById("txt").value = combined;
      }
    }
    interimText.textContent = live.trim();
  };

  recognition.onerror = (event) => {
    alert("שגיאה בהקלטה: " + event.error);
  };
})();

btnRecord.onclick = () => {
  if (!recognition) return;
  try {
    if (!recording) { recognition.start(); }
    else { recognition.stop(); }
  } catch (e) {}
};
