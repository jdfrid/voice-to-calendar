const assert = require("node:assert/strict");
const test = require("node:test");
const {
  extractDate,
  extractTime,
  parseMessage
} = require("../parser");

const NOW = new Date(2026, 5, 7, 14, 30, 0);

test("parses a Hebrew appointment with compact time and address", () => {
  const item = parseMessage("יש לי מחר פגישה אצל רופא השיניים בשעה 1200 ברחוב הרצל 42 תל אביב", { now: NOW });

  assert.equal(item.type, "calendar");
  assert.equal(item.title, "תור לרופא שיניים");
  assert.equal(item.address, "הרצל 42 תל אביב");
  assert.equal(item.start.getFullYear(), 2026);
  assert.equal(item.start.getMonth(), 5);
  assert.equal(item.start.getDate(), 8);
  assert.equal(item.start.getHours(), 12);
  assert.equal(item.start.getMinutes(), 0);
});

test("routes reminders without an appointment signal to tasks", () => {
  const item = parseMessage("תזכיר לי לקנות חלב מחר", { now: NOW });

  assert.equal(item.type, "task");
  assert.equal(item.due.getDate(), 8);
  assert.equal(item.due.getHours(), 9);
});

test("does not treat dates or street numbers as times", () => {
  assert.equal(extractTime("תור לרופא ב-12/06 ברחוב הרצל 42"), null);
  assert.equal(extractTime("לקנות 2 חלב"), null);
});

test("parses explicit and compact times", () => {
  assert.deepEqual(extractTime("פגישה בשעה 09:30"), { hours: 9, minutes: 30 });
  assert.deepEqual(extractTime("פגישה ב-1030"), { hours: 10, minutes: 30 });
  assert.deepEqual(extractTime("פגישה שעה 8"), { hours: 8, minutes: 0 });
});

test("parses relative dates, numeric dates, and future weekdays", () => {
  assert.equal(extractDate("מחרתיים", NOW).getDate(), 9);
  assert.equal(extractDate("בתאריך 12/6/26", NOW).getFullYear(), 2026);
  assert.equal(extractDate("ביום שלישי", NOW).getDate(), 9);
});
