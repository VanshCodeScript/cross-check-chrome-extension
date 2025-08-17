const REMINDERS_KEY = 'reminders';
const CHECKLIST_KEY = 'checklist';

// --- Tabs ---
const tabReminders = document.getElementById('tab-reminders');
const tabChecklist  = document.getElementById('tab-checklist');
const remindersSection = document.getElementById('reminders-section');
const checklistSection = document.getElementById('checklist-section');

tabReminders.addEventListener('click', () => {
  tabReminders.classList.add('active'); tabChecklist.classList.remove('active');
  remindersSection.classList.add('active'); checklistSection.classList.remove('active');
});
tabChecklist.addEventListener('click', () => {
  tabChecklist.classList.add('active'); tabReminders.classList.remove('active');
  checklistSection.classList.add('active'); remindersSection.classList.remove('active');
});

// --- Helpers ---
function getSync(keys) {
  return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
}
function setSync(obj) {
  return new Promise(resolve => chrome.storage.sync.set(obj, resolve));
}
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function fmt(dtMs) { return new Date(dtMs).toLocaleString(); }

// --- Reminders UI ---
const rForm = document.getElementById('reminder-form');
const rName = document.getElementById('r-name');
const rDeadline = document.getElementById('r-deadline');
const rDetails = document.getElementById('r-details');
const rList = document.getElementById('reminders-list');
const clearPastBtn = document.getElementById('clear-past');

// Load initial values for datetime-local to current + 1 day
(function presetDeadline(){
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); // local-friendly ISO
  const defaultDt = new Date(Date.now() + 24*60*60*1000);
  defaultDt.setMinutes(defaultDt.getMinutes() - defaultDt.getTimezoneOffset());
  rDeadline.value = defaultDt.toISOString().slice(0,16);
})();

async function loadReminders() {
  const res = await getSync([REMINDERS_KEY]);
  const reminders = res[REMINDERS_KEY] || [];
  renderReminders(reminders);
}

function renderReminders(reminders) {
  reminders.sort((a,b)=> a.deadline - b.deadline);
  rList.innerHTML = '';
  const now = Date.now();

  for (const r of reminders) {
    const li = document.createElement('li');
    li.className = 'card';

    const title = document.createElement('h3');
    title.textContent = r.name;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const diff = r.deadline - now;

    const badge = document.createElement('span');
    badge.className = 'badge';
    if (diff <= 0) { badge.textContent = 'Past due'; badge.classList.add('due'); }
    else if (diff <= 24*60*60*1000) { badge.textContent = '≤ 1 day'; badge.classList.add('warn'); }
    else { badge.textContent = 'Upcoming'; }

    meta.textContent = `Due: ${fmt(r.deadline)}`;
    meta.appendChild(badge);

    const details = document.createElement('p');
    details.textContent = r.details || '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const newList = reminders.filter(x => x.id !== r.id);
      await setSync({ [REMINDERS_KEY]: newList });
      loadReminders();
    });

    const snoozeBtn = document.createElement('button');
    snoozeBtn.textContent = 'Snooze 1h';
    snoozeBtn.addEventListener('click', async () => {
      const newList = reminders.map(x => x.id === r.id ? { ...x, deadline: x.deadline + 60*60*1000, notifiedOneDay: false } : x);
      await setSync({ [REMINDERS_KEY]: newList });
      loadReminders();
    });

    actions.appendChild(snoozeBtn);
    actions.appendChild(delBtn);

    li.appendChild(title);
    li.appendChild(actions);
    li.appendChild(meta);
    li.appendChild(details);
    rList.appendChild(li);
  }
}

rForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = rName.value.trim();
  const details = rDetails.value.trim();
  const dtLocal = rDeadline.value; // "YYYY-MM-DDTHH:MM"

  if (!name || !dtLocal) return;

  // Convert local datetime-local to ms epoch
  const deadline = new Date(dtLocal).getTime();

  const res = await getSync([REMINDERS_KEY]);
  const reminders = res[REMINDERS_KEY] || [];
  const newReminder = {
    id: uid(),
    name,
    details,
    deadline,
    createdAt: Date.now(),
    notifiedOneDay: false
  };
  reminders.push(newReminder);
  await setSync({ [REMINDERS_KEY]: reminders });

  rForm.reset();
  loadReminders();
});

// Clear reminders already past due
clearPastBtn.addEventListener('click', async () => {
  const res = await getSync([REMINDERS_KEY]);
  const reminders = res[REMINDERS_KEY] || [];
  const now = Date.now();
  const kept = reminders.filter(r => r.deadline > now);
  await setSync({ [REMINDERS_KEY]: kept });
  loadReminders();
});

// --- Checklist UI ---
const cForm = document.getElementById('checklist-form');
const cText = document.getElementById('c-text');
const cList = document.getElementById('checklist-list');
const clearDoneBtn = document.getElementById('clear-done');

async function loadChecklist() {
  const res = await getSync([CHECKLIST_KEY]);
  const items = res[CHECKLIST_KEY] || [];
  renderChecklist(items);
}

function renderChecklist(items) {
  cList.innerHTML = '';
  items.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'card';

    const title = document.createElement('h3');
    title.textContent = item.text;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.done ? 'Completed' : 'Pending';

    const details = document.createElement('p');
    details.textContent = item.note || '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const toggle = document.createElement('button');
    toggle.textContent = item.done ? 'Mark Pending' : 'Mark Done';
    toggle.addEventListener('click', async () => {
      const res = await getSync([CHECKLIST_KEY]);
      const arr = res[CHECKLIST_KEY] || [];
      arr[i] = { ...arr[i], done: !arr[i].done };
      await setSync({ [CHECKLIST_KEY]: arr });
      loadChecklist();
    });

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      const res = await getSync([CHECKLIST_KEY]);
      const arr = res[CHECKLIST_KEY] || [];
      arr.splice(i,1);
      await setSync({ [CHECKLIST_KEY]: arr });
      loadChecklist();
    });

    actions.appendChild(toggle);
    actions.appendChild(del);

    li.appendChild(title);
    li.appendChild(actions);
    li.appendChild(meta);
    li.appendChild(details);
    cList.appendChild(li);
  });
}

cForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = cText.value.trim();
  if (!text) return;
  const res = await getSync([CHECKLIST_KEY]);
  const items = res[CHECKLIST_KEY] || [];
  items.push({ text, done: false, createdAt: Date.now() });
  await setSync({ [CHECKLIST_KEY]: items });
  cForm.reset();
  loadChecklist();
});

clearDoneBtn.addEventListener('click', async () => {
  const res = await getSync([CHECKLIST_KEY]);
  const items = res[CHECKLIST_KEY] || [];
  const kept = items.filter(i => !i.done);
  await setSync({ [CHECKLIST_KEY]: kept });
  loadChecklist();
});

// Initial load
loadReminders();
loadChecklist();
