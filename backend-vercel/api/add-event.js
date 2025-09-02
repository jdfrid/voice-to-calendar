import { google } from "googleapis";
export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { summary, location, start, end, timezone, calendarId } = req.body || {};
    if (!summary || !start || !end) return res.status(400).json({ error: "Missing summary/start/end" });
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
    if (!sa.client_email) return res.status(500).json({ error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON" });
    const jwt = new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/calendar.events"] });
    const calendar = google.calendar({ version: "v3", auth: jwt });
    const result = await calendar.events.insert({
      calendarId: calendarId || "primary",
      requestBody: { summary, location: location || undefined, start: { dateTime: start, timeZone: timezone || "Asia/Jerusalem" }, end: { dateTime: end, timeZone: timezone || "Asia/Jerusalem" }, reminders: { useDefault: true } }
    });
    res.json({ ok: true, htmlLink: result.data.htmlLink });
  } catch (e) { res.status(500).json({ error: e.message }); }
}