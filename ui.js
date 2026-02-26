const dateInput = document.getElementById('dateInput');
const toggle = document.getElementById('calculationModeToggle');
const deadlinesContainer = document.getElementById('deadlinesContainer');
const customInput = document.getElementById('customDeadlines');
const updateButton = document.getElementById('updateCustomDeadlines');
const toggleInstructions = document.getElementById('toggleInstructions');
const instructionsContent = document.getElementById('instructionsContent');

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});

// State
let lastTrialDateStr = ''; // YYYY-MM-DD
let useCourtDays = toggle.checked;

const parseDifferentials = (input) => {
  if (!input) return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  const tokens = trimmed.split(/[\s,\.]+/).filter(Boolean);
  if (tokens.length > 20) return null; // Too many

  const results = [];
  for (const t of tokens) {
    if (!/^[-+]?\d+$/.test(t)) return null; // Invalid format
    const n = Number(t);
    if (n < -1000 || n > 1000) return null; // Out of bounds
    results.push(n);
  }
  return results;
};

const renderResults = (deadlinesMap, sortedDiffs) => {
  deadlinesContainer.className = useCourtDays ? 'court-mode' : 'calendar-mode';

  let html = '';
  for (const diff of sortedDiffs) {
    const dateIso = deadlinesMap[diff];
    if (!dateIso) continue;

    const parts = dateIso.split('-');
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

    const offsetText = Math.abs(diff);
    const typeText = useCourtDays ? 'court' : 'calendar';
    const dirText = diff >= 0 ? 'after' : 'before';

    const formattedDate = dateFormatter.format(dateObj);
    const description = `${offsetText} ${typeText} days ${dirText} the selected date:`;

    html += `<h3>${description} <span class="deadlines">${formattedDate}</span></h3>`;
  }

  deadlinesContainer.innerHTML = html;
};

let fetchTimeout = null;
const fetchDeadlines = () => {
  if (fetchTimeout !== null) clearTimeout(fetchTimeout);

  fetchTimeout = setTimeout(() => {
    const offsetsValue = customInput.value;
    const diffs = parseDifferentials(offsetsValue);

    if (diffs === null && offsetsValue.trim()) {
      deadlinesContainer.className = '';
      deadlinesContainer.innerHTML = '<p class="error">Invalid input. Enter integers between -1000 and 1000, separated by spaces or commas.</p>';
      return;
    }

    if (!lastTrialDateStr || !diffs || diffs.length === 0) {
      deadlinesContainer.innerHTML = '';
      return;
    }

    const url = '/api/calculate';
    const headers = {
      'x-start-date': lastTrialDateStr,
      'x-offsets': diffs.join(','),
      'x-calculation-method': useCourtDays ? 'court' : 'calendar'
    };

    fetch(url, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        renderResults(data.deadlines, diffs);
      })
      .catch(err => {
        console.error(err);
        deadlinesContainer.innerHTML = '<p class="error">Error calculating deadlines. Please try again.</p>';
      });
  }, 100);
};

// Event Listeners
dateInput.addEventListener('change', (e) => {
  lastTrialDateStr = e.target.value; // YYYY-MM-DD from input type="date"
  fetchDeadlines();
});

toggle.addEventListener('change', (e) => {
  useCourtDays = e.target.checked;
  if (useCourtDays) {
    updateButton.classList.add('court-mode-btn');
  } else {
    updateButton.classList.remove('court-mode-btn');
  }
  fetchDeadlines();
});

updateButton.addEventListener('click', fetchDeadlines);
customInput.addEventListener('change', fetchDeadlines); // Also update on change/blur

toggleInstructions.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = instructionsContent.style.display === 'none';
  instructionsContent.style.display = isHidden ? 'block' : 'none';
  toggleInstructions.textContent = isHidden ? 'Hide Instructions' : 'Show Instructions';
});

// Init
if (!dateInput.value) {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${y}-${m}-${d}`;
}

lastTrialDateStr = dateInput.value;

if (useCourtDays) {
  updateButton.classList.add('court-mode-btn');
} else {
  updateButton.classList.remove('court-mode-btn');
}

if (customInput.value.trim()) {
  fetchDeadlines();
}
