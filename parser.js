(function initParser(globalScope) {
  const HOUR_MS = 60 * 60 * 1000;
  const DEFAULT_DURATION_MS = HOUR_MS;
  const WEEKDAYS = {
    "ראשון": 0,
    "שני": 1,
    "שלישי": 2,
    "רביעי": 3,
    "חמישי": 4,
    "שישי": 5,
    "שבת": 6
  };

  function parseMessage(rawText, options = {}) {
    const text = normalize(rawText);
    if (!text) return null;

    const now = options.now ? new Date(options.now) : new Date();
    const title = extractTitle(text);
    const date = extractDate(text, now);
    const time = extractTime(text);
    const address = extractAddress(text);
    const isAppointment = detectAppointment(text, date, time, address);
    const confidence = calculateConfidence({ text, isAppointment, date, time, address });

    if (isAppointment) {
      const start = buildStartDate(date, time, now);
      const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
      return {
        type: "calendar",
        label: "פגישה ביומן",
        confidence,
        title,
        start,
        end,
        address,
        notes: text
      };
    }

    return {
      type: "task",
      label: "משימה",
      confidence,
      title: title || text,
      notes: text,
      due: date ? buildStartDate(date, time, now) : null
    };
  }

  function detectAppointment(text, date, time, address) {
    const appointmentWords = ["פגישה", "פגישת", "תור", "רופא", "רופאת", "שיננית", "בדיקה", "טיפול", "ראיון", "שיחה"];
    const taskWords = ["תזכיר", "תזכורת", "לקנות", "לעשות", "משימה", "להתקשר", "לשלוח", "לשלם"];
    const score =
      countMatches(text, appointmentWords) * 2 +
      (date ? 1 : 0) +
      (time ? 2 : 0) +
      (address ? 1 : 0) -
      countMatches(text, taskWords);

    return score >= 3;
  }

  function calculateConfidence({ text, isAppointment, date, time, address }) {
    let score = isAppointment ? 54 : 62;
    if (date) score += 14;
    if (time) score += 16;
    if (address) score += 10;
    if (text.length > 18) score += 6;
    return Math.min(score, 96);
  }

  function extractDate(text, now = new Date()) {
    if (hasHebrewWord(text, "מחרתיים")) return atStartOfDay(addDays(now, 2));
    if (hasHebrewWord(text, "מחר")) return atStartOfDay(addDays(now, 1));
    if (hasHebrewWord(text, "היום")) return atStartOfDay(now);

    const numeric = text.match(/(?:^|\s)(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?=\s|$)/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]) - 1;
      const year = numeric[3] ? normalizeYear(Number(numeric[3])) : now.getFullYear();
      const date = new Date(year, month, day);
      return isValidDateParts(date, year, month, day) ? atStartOfDay(date) : null;
    }

    const weekday = text.match(/(?:ביום|יום)?\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![\u0590-\u05ff])/);
    if (weekday) {
      return nextWeekday(now, WEEKDAYS[weekday[1]]);
    }

    return null;
  }

  function extractTime(text) {
    const candidates = [
      /(?:בשעה|שעה|ב-)\s*(\d{1,2})(?::|\.| ו)?(\d{2})?\b/g,
      /(?:^|\s)(\d{1,2})[:.](\d{2})(?=\s|$)/g,
      /(?:^|\s)([01]?\d|2[0-3])([0-5]\d)(?=\s|$)/g
    ];

    for (const pattern of candidates) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const hours = Number(match[1]);
        const minutes = Number(match[2] || 0);
        if (isValidTime(hours, minutes) && !looksLikeDate(text, match.index, match[0])) {
          return { hours, minutes };
        }
      }
    }

    return null;
  }

  function looksLikeDate(text, index, value) {
    const previous = text[index - 1] || "";
    const next = text[index + value.length] || "";
    const numericPart = value.replace(/(?:בשעה|שעה|ב-)\s*/, "");
    return /[./-]/.test(numericPart) || /[./-]/.test(previous + next);
  }

  function extractAddress(text) {
    const match = text.match(/(?:ברחוב|ברח'|רחוב|רח'|בכתובת)\s+(.+?)(?:\s+(?:בשעה|שעה|מחרתיים|מחר|היום|ביום|בתאריך)|$)/);
    return match ? cleanText(match[1]) : "";
  }

  function extractTitle(text) {
    if (/רופא(?:ת)?\s*השיניים|שיננית|שיניים/.test(text)) return "תור לרופא שיניים";
    if (/רופא|רופאה/.test(text)) return "תור לרופא";
    if (/פגישת?\s+עבודה/.test(text)) return "פגישת עבודה";
    if (/פגישה|פגישת/.test(text)) return "פגישה";
    if (/תור/.test(text)) return "תור";
    return cleanText(text).slice(0, 70);
  }

  function buildStartDate(date, time, now = new Date()) {
    const base = date ? new Date(date) : new Date(now);
    base.setHours(time?.hours ?? 9, time?.minutes ?? 0, 0, 0);
    return base;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function atStartOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function nextWeekday(now, weekday) {
    const date = atStartOfDay(now);
    let days = (weekday - date.getDay() + 7) % 7;
    if (days === 0) days = 7;
    return addDays(date, days);
  }

  function normalizeYear(year) {
    return year < 100 ? 2000 + year : year;
  }

  function isValidDateParts(date, year, month, day) {
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  }

  function isValidTime(hours, minutes) {
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function normalize(value) {
    return cleanText(value || "");
  }

  function cleanText(value) {
    return String(value).replace(/\s+/g, " ").trim();
  }

  function hasHebrewWord(text, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\u0590-\\u05ff])${escaped}($|[^\\u0590-\\u05ff])`).test(text);
  }

  function countMatches(text, words) {
    return words.reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0);
  }

  const api = {
    parseMessage,
    detectAppointment,
    calculateConfidence,
    extractDate,
    extractTime,
    extractAddress,
    extractTitle,
    buildStartDate,
    normalize,
    cleanText
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.VoiceParser = api;
})(typeof window !== "undefined" ? window : globalThis);
