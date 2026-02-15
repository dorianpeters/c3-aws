import cf from 'cloudfront';

const kvsHandle = cf.kvs();

async function handler(event) {
  const request = event.request;
  const headers = request.headers;

  // Helper to safely extract headers
  function getHeader(name) {
    return headers[name] ? headers[name].value : null;
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

    // A local cache for this execution to avoid hitting KVS limits in loops
    const localHolidayCache = {};

    var deadlines = await calculateDeadlines(startDate, offsets, useCourtDays, kvsHandle, localHolidayCache);

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
    console.log('Error calculating deadlines:', e);
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

function addCalendarDaysFn(date, n) {
  var d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Now async to fetch from KVS
async function isCourtDay(date, kvsHandle, cache) {
  var day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  var d = date.getDate();
  var keyStr = ((y * 10000) + (m * 100) + d).toString(); // e.g., "20250101"

  // Check local memory cache first
  if (cache[keyStr] !== undefined) {
    return !cache[keyStr]; // Return true if it is NOT a holiday
  }

  try {
    // If the key exists, it's a holiday
    await kvsHandle.get(keyStr);
    cache[keyStr] = true;
    return false;
  } catch (err) {
    // KVS throws an error if the key is not found -> Not a holiday
    cache[keyStr] = false;
    return true;
  }
}

async function adjustBackwardToCourtDay(date, kvsHandle, cache) {
  var d = new Date(date);
  while (!(await isCourtDay(d, kvsHandle, cache))) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

async function adjustForwardToCourtDay(date, kvsHandle, cache) {
  var d = new Date(date);
  while (!(await isCourtDay(d, kvsHandle, cache))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

async function addCourtDays(date, n, kvsHandle, cache) {
  if (n === 0) {
    return (await isCourtDay(date, kvsHandle, cache)) ? new Date(date) : await adjustForwardToCourtDay(date, kvsHandle, cache);
  }
  var step = n > 0 ? 1 : -1;
  var count = 0;
  var d = new Date(date);

  while (count < Math.abs(n)) {
    d.setDate(d.getDate() + step);
    if (await isCourtDay(d, kvsHandle, cache)) count++;
  }
  return d;
}

async function addDays(date, n, opts) {
  opts = opts || {};
  var useCourtDays = opts.useCourtDays || false;
  var kvsHandle = opts.kvsHandle;
  var cache = opts.cache;

  if (useCourtDays) return await addCourtDays(date, n, kvsHandle, cache);

  var candidate = addCalendarDaysFn(date, n);
  if (!(await isCourtDay(candidate, kvsHandle, cache))) {
    return n >= 0
      ? await adjustForwardToCourtDay(candidate, kvsHandle, cache)
      : await adjustBackwardToCourtDay(candidate, kvsHandle, cache);
  }
  return candidate;
}

// --- Deadline Calculator ---

async function calculateDeadlines(startDate, differentials, useCourtDays, kvsHandle, cache) {
  var results = {};

  // Replaced forEach with a standard for-loop to properly await the async calls
  for (var i = 0; i < differentials.length; i++) {
    var diff = differentials[i];
    var date = await addDays(startDate, diff, {
      useCourtDays: useCourtDays,
      kvsHandle: kvsHandle,
      cache: cache
    });
    results[diff] = toLocalIso(date);
  }

  return results;
}