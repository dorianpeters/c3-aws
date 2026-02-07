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

// --- Holidays ---
// Pre-computed integer map for O(1) lookup
var holidayIntSet = {
  "20250101": true,
  "20250120": true,
  "20250212": true,
  "20250217": true,
  "20250331": true,
  "20250526": true,
  "20250619": true,
  "20250704": true,
  "20250901": true,
  "20250926": true,
  "20251111": true,
  "20251127": true,
  "20251128": true,
  "20251225": true,
  "20260101": true,
  "20260119": true,
  "20260212": true,
  "20260216": true,
  "20260331": true,
  "20260525": true,
  "20260619": true,
  "20260703": true,
  "20260907": true,
  "20260925": true,
  "20261111": true,
  "20261126": true,
  "20261127": true,
  "20261225": true,
  "20270101": true,
  "20270118": true,
  "20270212": true,
  "20270215": true,
  "20270331": true,
  "20270531": true,
  "20270618": true,
  "20270705": true,
  "20270906": true,
  "20270924": true,
  "20271111": true,
  "20271125": true,
  "20271126": true,
  "20271224": true,
  "20271231": true,
  "20280117": true,
  "20280211": true,
  "20280221": true,
  "20280331": true,
  "20280529": true,
  "20280619": true,
  "20280704": true,
  "20280904": true,
  "20280922": true,
  "20281110": true,
  "20281123": true,
  "20281124": true,
  "20281225": true,
  "20290101": true,
  "20290115": true,
  "20290212": true,
  "20290219": true,
  "20290330": true,
  "20290528": true,
  "20290619": true,
  "20290704": true,
  "20290903": true,
  "20290928": true,
  "20291112": true,
  "20291122": true,
  "20291123": true,
  "20291225": true,
  "20300101": true,
  "20300121": true,
  "20300212": true,
  "20300218": true,
  "20300401": true,
  "20300527": true,
  "20300619": true,
  "20300704": true,
  "20300902": true,
  "20300927": true,
  "20301111": true,
  "20301128": true,
  "20301129": true,
  "20301225": true,
  "20310101": true,
  "20310120": true,
  "20310212": true,
  "20310217": true,
  "20310331": true,
  "20310526": true,
  "20310619": true,
  "20310704": true,
  "20310901": true,
  "20310926": true,
  "20311111": true,
  "20311127": true,
  "20311128": true,
  "20311225": true,
  "20320101": true,
  "20320119": true,
  "20320212": true,
  "20320216": true,
  "20320331": true,
  "20320531": true,
  "20320618": true,
  "20320705": true,
  "20320906": true,
  "20320924": true,
  "20321111": true,
  "20321125": true,
  "20321126": true,
  "20321224": true,
  "20321231": true,
  "20330117": true,
  "20330211": true,
  "20330221": true,
  "20330331": true,
  "20330530": true,
  "20330620": true,
  "20330704": true,
  "20330905": true,
  "20330923": true,
  "20331111": true,
  "20331124": true,
  "20331125": true,
  "20331226": true,
  "20340102": true,
  "20340116": true,
  "20340213": true,
  "20340220": true,
  "20340331": true,
  "20340529": true,
  "20340619": true,
  "20340704": true,
  "20340904": true,
  "20340922": true,
  "20341110": true,
  "20341123": true,
  "20341124": true,
  "20341225": true,
  "20350101": true,
  "20350115": true,
  "20350212": true,
  "20350219": true,
  "20350330": true,
  "20350528": true,
  "20350619": true,
  "20350704": true,
  "20350903": true,
  "20350928": true,
  "20351112": true,
  "20351122": true,
  "20351123": true,
  "20351225": true
};
// End of script