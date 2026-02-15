function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Helper to get header value safely
  function getHeader(name) {
    if (headers[name] && headers[name].value) {
      return headers[name].value;
    }
    return null; // Return null if header doesn't exist
  }

  var startDateStr = getHeader('x-start-date');
  var offsetsStr = getHeader('x-offsets');
  var calculationMethod = getHeader('x-calculation-method') || 'calendar'; // Default to calendar

  // Validation
  if (!startDateStr) {
    return {
      statusCode: 400,
      statusDescription: 'Bad Request',
      body: JSON.stringify({ error: "Missing 'x-start-date' header" })
    };
  }

  if (!offsetsStr) {
    return {
      statusCode: 400,
      statusDescription: 'Bad Request',
      body: JSON.stringify({ error: "Missing 'x-offsets' header" })
    };
  }

  var offsets = offsetsStr.split(',').map(function (s) { return parseInt(s.trim(), 10); });
  if (offsets.some(isNaN)) {
    return {
      statusCode: 400,
      statusDescription: 'Bad Request',
      body: JSON.stringify({ error: "Invalid 'x-offsets' value. Must be comma-separated integers." })
    };
  }

  var useCourtDays = calculationMethod === 'court';

  try {
    var startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      throw new Error("Invalid start date format");
    }

    var deadlines = calculateDeadlines(startDate, offsets, useCourtDays);

    return {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {
        'content-type': { value: 'application/json' }
      },
      body: JSON.stringify({
        startDate: toLocalIso(startDate),
        calculationMethod: calculationMethod,
        deadlines: deadlines
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      statusDescription: 'Internal Server Error',
      body: JSON.stringify({ error: e.message })
    };
  }
}



// --- Date Utils ---

function pad2(n) {
  return ('0' + n).slice(-2);
}

function toLocalIso(date) {
  var y = date.getFullYear();
  var m = pad2(date.getMonth() + 1);
  var d = pad2(date.getDate());
  return y + '-' + m + '-' + d;
}

function isSaturday(date) {
  return date.getDay() === 6;
}

function isSunday(date) {
  return date.getDay() === 0;
}

function isCourtDay(date, holidays) {
  holidays = holidays || holidayIntSet;
  // 1. Cheap check: Weekends
  var day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  // 2. Math-based key generation (0 instructions compared to string formatting)
  // Example: 2025-01-01 becomes 20250101
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();

  // Math: Year * 10000 + Month * 100 + Day
  var key = (y * 10000) + (m * 100) + d;

  // 3. Fast Integer Lookup
  // Note: We use the holidayIntSet we created above
  return !holidays[key];
}

function addCalendarDaysFn(date, n) {
  var d = new Date(date); // Clone
  d.setDate(d.getDate() + n);
  return d;
}

function subDays(date, n) {
  return addCalendarDaysFn(date, -n);
}

function adjustBackwardToCourtDay(date, holidays) {
  holidays = holidays || holidayIntSet;
  var d = new Date(date);
  while (!isCourtDay(d, holidays)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function adjustForwardToCourtDay(date, holidays) {
  holidays = holidays || holidayIntSet;
  var d = new Date(date);
  while (!isCourtDay(d, holidays)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function addCourtDays(date, n, holidays) {
  holidays = holidays || holidayIntSet;
  if (n === 0) {
    return isCourtDay(date, holidays) ? new Date(date) : adjustForwardToCourtDay(date, holidays);
  }
  var step = n > 0 ? 1 : -1;
  var count = 0;
  var d = new Date(date);
  while (count < Math.abs(n)) {
    d.setDate(d.getDate() + step);
    if (isCourtDay(d, holidays)) count++;
  }
  return d;
}

function addDays(date, n, opts) {
  opts = opts || {};
  var useCourtDays = opts.useCourtDays || false;
  var holidays = opts.holidays || holidayIntSet;

  if (useCourtDays) return addCourtDays(date, n, holidays);

  var candidate = addCalendarDaysFn(date, n);
  if (!isCourtDay(candidate, holidays)) {
    return n >= 0
      ? adjustForwardToCourtDay(candidate, holidays)
      : adjustBackwardToCourtDay(candidate, holidays);
  }
  return candidate;
}

// --- Deadline Calculator ---

function calculateDeadlines(startDate, differentials, useCourtDays, holidays) {
  useCourtDays = useCourtDays || false;
  holidays = holidays || holidayIntSet;

  var results = {};

  // Using forEach for compatibility
  differentials.forEach(function (diff) {
    var date = addDays(startDate, diff, { useCourtDays: useCourtDays, holidays: holidays });
    results[diff] = toLocalIso(date);
  });

  return results;
}

// End of script