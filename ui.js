(function () {
  var dateInput = document.getElementById('dateInput');
  var toggle = document.getElementById('calculationModeToggle');
  var deadlinesContainer = document.getElementById('deadlinesContainer');
  var customInput = document.getElementById('customDeadlines');
  var updateButton = document.getElementById('updateCustomDeadlines');
  var toggleInstructions = document.getElementById('toggleInstructions');
  var instructionsContent = document.getElementById('instructionsContent');

  var dateFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  // State
  var lastTrialDateStr = ''; // YYYY-MM-DD
  var useCourtDays = toggle.checked;

  function parseDifferentials(input) {
    if (!input) return [];
    var trimmed = input.trim();
    if (!trimmed) return [];

    var tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    if (tokens.length > 250) return null; // Too many

    var results = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!/^[-+]?\d+$/.test(t)) return null; // Invalid format
      var n = Number(t);
      if (n < -1000 || n > 1000) return null; // Out of bounds
      results.push(n);
    }
    return results;
  }

  function fetchDeadlines() {
    // Requirements: Date, Offsets, Mode
    var offsetsValue = customInput.value;
    var diffs = parseDifferentials(offsetsValue);

    if (diffs === null && offsetsValue.trim()) {
      deadlinesContainer.className = '';
      deadlinesContainer.innerHTML = '<p class="error">Invalid input. Enter integers between -1000 and 1000, separated by spaces or commas.</p>';
      return;
    }

    if (!lastTrialDateStr || !diffs || diffs.length === 0) {
      deadlinesContainer.innerHTML = '';
      return;
    }

    // Construct API request
    // We assume the CloudFront function is intercepting this request
    // or we are hitting an endpoint that proxies to it.
    // Spec: "update anytime the starting date, the offsets, or changes"

    // Using current URL as base, expecting intercept.
    var url = window.location.href;

    var headers = {
      'x-start-date': lastTrialDateStr,
      'x-offsets': diffs.join(','),
      'x-calculation-method': useCourtDays ? 'court' : 'calendar'
    };

    fetch(url, { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('API Error: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // data.deadlines is { "offset": "YYYY-MM-DD" }
        renderResults(data.deadlines, diffs);
      })
      .catch(function (err) {
        console.error(err);
        deadlinesContainer.innerHTML = '<p class="error">Error calculating deadlines. Please try again.</p>';
      });
  }

  function renderResults(deadlinesMap, sortedDiffs) {
    deadlinesContainer.className = useCourtDays ? 'court-mode' : 'calendar-mode';

    var html = '';
    // Use sortedDiffs to maintain input order
    for (var i = 0; i < sortedDiffs.length; i++) {
      var diff = sortedDiffs[i];
      var dateIso = deadlinesMap[diff];
      if (!dateIso) continue;

      // Parse date for formatting (YYYY-MM-DD)
      // Note: new Date("2026-03-09") is treated as UTC in JS usually, 
      // but we want local or strictly formatted. 
      // Best to append T00:00:00 to ensure local date interpretation or split.
      var parts = dateIso.split('-');
      // Note: Month is 0-indexed in JS Date constructor
      var dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

      var offsetText = Math.abs(diff);
      var typeText = useCourtDays ? 'court' : 'calendar';
      var dirText = diff >= 0 ? 'after' : 'before';

      var formattedDate = dateFormatter.format(dateObj);

      // "5 calendar days after the selected date: Friday, February 13, 2026"
      var description = offsetText + ' ' + typeText + ' days ' + dirText + ' the selected date:';

      html += '<h3>' + description + ' <span class="deadlines">' + formattedDate + '</span></h3>';
    }

    deadlinesContainer.innerHTML = html;
  }

  // Event Listeners
  dateInput.addEventListener('change', function (e) {
    lastTrialDateStr = e.target.value; // YYYY-MM-DD from input type="date"
    fetchDeadlines();
  });

  toggle.addEventListener('change', function (e) {
    useCourtDays = e.target.checked;
    fetchDeadlines();
  });

  updateButton.addEventListener('click', fetchDeadlines);
  customInput.addEventListener('change', fetchDeadlines); // Also update on change/blur

  toggleInstructions.addEventListener('click', function (e) {
    e.preventDefault();
    var isHidden = instructionsContent.style.display === 'none';
    instructionsContent.style.display = isHidden ? 'block' : 'none';
    toggleInstructions.textContent = isHidden ? 'Hide Instructions' : 'Show Instructions';
  });

  // Init
  if (dateInput.value) {
    lastTrialDateStr = dateInput.value;
    fetchDeadlines();
  }

})();
