// ---- Utilities ----
const REMINDERS_KEY = 'reminders';
const CHECKLIST_KEY = 'checklist';

// Fetch all reminders from sync storage
async function getReminders() {
  return new Promise(resolve => {
    chrome.storage.sync.get([REMINDERS_KEY], res => resolve(res[REMINDERS_KEY] || []));
  });
}

// Save reminders
async function setReminders(reminders) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [REMINDERS_KEY]: reminders }, () => resolve());
  });
}

// Badge update: show count of reminders due within 24 hours and not yet 1-day-notified
async function updateBadge() {
  const reminders = await getReminders();
  const now = Date.now();
  const soonCount = reminders.filter(r => {
    const diff = r.deadline - now;
    return diff > 0 && diff <= 24 * 60 * 60 * 1000 && !r.notifiedOneDay;
  }).length;
  chrome.action.setBadgeText({ text: soonCount ? String(soonCount) : '' });
}

// Schedule alarms for a single reminder
async function scheduleAlarmsForReminder(reminder) {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const minus1DayWhen = reminder.deadline - oneDayMs;
  const now = Date.now();

  // Clear any existing alarms for this reminder id
  await chrome.alarms.clear(`reminder_${reminder.id}_minus1day`);

  // If the 1-day mark is in the future, schedule it.
  if (minus1DayWhen > now) {
    chrome.alarms.create(`reminder_${reminder.id}_minus1day`, { when: minus1DayWhen });
  } else if (reminder.deadline > now && !reminder.notifiedOneDay) {
    // If we're already inside the final 24h window, trigger a “1 day left” style nudge soon.
    chrome.alarms.create(`reminder_${reminder.id}_minus1day`, { when: now + 60 * 1000 }); // 1 minute from now
  }

  // Keep badge fresh
  updateBadge();
}

// Reschedule alarms for all reminders (e.g., on startup/installed)
async function rescheduleAll() {
  const reminders = await getReminders();
  for (const r of reminders) {
    await scheduleAlarmsForReminder(r);
  }
  updateBadge();
}

// ---- Notifications ----
function notifyOneDayLeft(reminder) {
  chrome.notifications.create(`notify_${reminder.id}_1day`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '⏰ 1 day left',
    message: `${reminder.name} — due ${new Date(reminder.deadline).toLocaleString()}`,
    priority: 2
  });
}

// ---- Event wiring ----
chrome.runtime.onInstalled.addListener(() => {
  rescheduleAll();
});

chrome.runtime.onStartup.addListener(() => {
  rescheduleAll();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[REMINDERS_KEY]) {
    // Re-schedule whenever reminders list changes
    rescheduleAll();
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async alarm => {
  const match = alarm.name.match(/^reminder_(.+)_minus1day$/);
  if (!match) return;

  const id = match[1];
  const reminders = await getReminders();
  const idx = reminders.findIndex(r => r.id === id);
  if (idx === -1) return;

  const reminder = reminders[idx];

  // If still within 24h window and not yet notified, notify and mark flag
  const now = Date.now();
  if (reminder.deadline > now && !reminder.notifiedOneDay) {
    notifyOneDayLeft(reminder);
    reminders[idx] = { ...reminder, notifiedOneDay: true, notifiedOneDayAt: now };
    await setReminders(reminders);
  }

  updateBadge();
});
