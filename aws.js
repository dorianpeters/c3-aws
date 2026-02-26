import cf from 'cloudfront';

const kvsHandle = cf.kvs();

async function handler(event) {
  const request = event.request;
  const headers = request.headers;

  const getHeader = (name) => headers[name] ? headers[name].value : null;

  const startDateStr = getHeader('x-start-date');
  const offsetsStr = getHeader('x-offsets');
  const calculationMethod = getHeader('x-calculation-method') || 'calendar';

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

  const offsets = offsetsStr.split(',').map(s => parseInt(s.trim(), 10));
  if (offsets.some(isNaN)) {
    return {
      statusCode: 400,
      statusDescription: 'Bad Request',
      body: JSON.stringify({ error: "Invalid 'x-offsets' value. Must be comma-separated integers." })
    };
  }

  if (offsets.length > 20) {
    return {
      statusCode: 400,
      statusDescription: 'Bad Request',
      body: JSON.stringify({ error: "Too many 'x-offsets' values provided. Maximum allowed is 20." })
    };
  }

  const useCourtDays = calculationMethod === 'court';

  try {
    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      throw new Error("Invalid start date format");
    }

    const localHolidayCache = {};

    const deadlines = await calculateDeadlines(startDate, offsets, useCourtDays, kvsHandle, localHolidayCache);

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
    console.log(`Error calculating deadlines: ${e}`);
    return {
      statusCode: 500,
      statusDescription: 'Internal Server Error',
      body: JSON.stringify({ error: e.message })
    };
  }
}

const pad2 = (n) => (`0${n}`).slice(-2);

const toLocalIso = (date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

const addCalendarDaysFn = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

async function isCourtDay(date, kvsHandle, cache) {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const keyStr = ((y * 10000) + (m * 100) + d).toString();

  if (cache[keyStr] !== undefined) {
    return !cache[keyStr];
  }

  try {
    await kvsHandle.get(keyStr);
    cache[keyStr] = true;
    return false;
  } catch (err) {
    cache[keyStr] = false;
    return true;
  }
}

async function adjustBackwardToCourtDay(date, kvsHandle, cache) {
  const d = new Date(date);
  while (!(await isCourtDay(d, kvsHandle, cache))) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

async function adjustForwardToCourtDay(date, kvsHandle, cache) {
  const d = new Date(date);
  while (!(await isCourtDay(d, kvsHandle, cache))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

async function addCourtDays(date, n, kvsHandle, cache) {
  if (n === 0) {
    return (await isCourtDay(date, kvsHandle, cache)) ? new Date(date) : await adjustForwardToCourtDay(date, kvsHandle, cache);
  }
  const step = n > 0 ? 1 : -1;
  let count = 0;
  const d = new Date(date);

  while (count < Math.abs(n)) {
    d.setDate(d.getDate() + step);
    if (await isCourtDay(d, kvsHandle, cache)) count++;
  }
  return d;
}

async function addDays(date, n, opts) {
  opts = opts || {};
  const useCourtDays = opts.useCourtDays || false;
  const kvsHandle = opts.kvsHandle;
  const cache = opts.cache;

  if (useCourtDays) return await addCourtDays(date, n, kvsHandle, cache);

  const candidate = addCalendarDaysFn(date, n);
  if (!(await isCourtDay(candidate, kvsHandle, cache))) {
    return n >= 0
      ? await adjustForwardToCourtDay(candidate, kvsHandle, cache)
      : await adjustBackwardToCourtDay(candidate, kvsHandle, cache);
  }
  return candidate;
}

async function calculateDeadlines(startDate, differentials, useCourtDays, kvsHandle, cache) {
  const results = {};

  for (let i = 0; i < differentials.length; i++) {
    const diff = differentials[i];
    const date = await addDays(startDate, diff, {
      useCourtDays: useCourtDays,
      kvsHandle: kvsHandle,
      cache: cache
    });
    results[diff] = toLocalIso(date);
  }

  return results;
}