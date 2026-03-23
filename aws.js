const holidays = {
  20250101:1, 20250120:1, 20250212:1, 20250217:1, 20250331:1, 20250526:1, 20250619:1, 20250704:1, 20250901:1, 20250926:1,
  20251111:1, 20251127:1, 20251128:1, 20251225:1, 20260101:1, 20260119:1, 20260212:1, 20260216:1, 20260331:1, 20260525:1,
  20260619:1, 20260703:1, 20260907:1, 20260925:1, 20261111:1, 20261126:1, 20261127:1, 20261225:1, 20270101:1, 20270118:1,
  20270212:1, 20270215:1, 20270331:1, 20270531:1, 20270618:1, 20270705:1, 20270906:1, 20270924:1, 20271111:1, 20271125:1,
  20271126:1, 20271224:1, 20271231:1, 20280117:1, 20280211:1, 20280221:1, 20280331:1, 20280529:1, 20280619:1, 20280704:1,
  20280904:1, 20280922:1, 20281110:1, 20281123:1, 20281124:1, 20281225:1, 20290101:1, 20290115:1, 20290212:1, 20290219:1,
  20290330:1, 20290528:1, 20290619:1, 20290704:1, 20290903:1, 20290928:1, 20291112:1, 20291122:1, 20291123:1, 20291225:1,
  20300101:1, 20300121:1, 20300212:1, 20300218:1, 20300401:1, 20300527:1, 20300619:1, 20300704:1, 20300902:1, 20300927:1,
  20301111:1, 20301128:1, 20301129:1, 20301225:1, 20310101:1, 20310120:1, 20310212:1, 20310217:1, 20310331:1, 20310526:1,
  20310619:1, 20310704:1, 20310901:1, 20310926:1, 20311111:1, 20311127:1, 20311128:1, 20311225:1, 20320101:1, 20320119:1,
  20320212:1, 20320216:1, 20320331:1, 20320531:1, 20320618:1, 20320705:1, 20320906:1, 20320924:1, 20321111:1, 20321125:1,
  20321126:1, 20321224:1, 20321231:1, 20330117:1, 20330211:1, 20330221:1, 20330331:1, 20330530:1, 20330620:1, 20330704:1,
  20330905:1, 20330923:1, 20331111:1, 20331124:1, 20331125:1, 20331226:1, 20340102:1, 20340116:1, 20340213:1, 20340220:1,
  20340331:1, 20340529:1, 20340619:1, 20340704:1, 20340904:1, 20340922:1, 20341110:1, 20341123:1, 20341124:1, 20341225:1,
  20350101:1, 20350115:1, 20350212:1, 20350219:1, 20350330:1, 20350528:1, 20350619:1, 20350704:1, 20350903:1, 20350928:1,
  20351112:1, 20351122:1, 20351123:1, 20351225:1
};

function handler(event) {
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

    const dates = calculateDates(startDate, offsets, useCourtDays);

    return {
      statusCode: 200,
      statusDescription: 'OK',
      headers: {
        'content-type': { value: 'application/json' }
      },
      body: JSON.stringify({
        startDate: toLocalIso(startDate),
        calculationMethod: calculationMethod,
        results: dates
      })
    };

  } catch (e) {
    console.log(`Error calculating dates: ${e}`);
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

function isCourtDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const keyStr = ((y * 10000) + (m * 100) + d).toString();

  if (holidays[keyStr]) {
    return false;
  }
  return true;
}

function adjustBackwardToCourtDay(date) {
  const d = new Date(date);
  while (!isCourtDay(d)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function adjustForwardToCourtDay(date) {
  const d = new Date(date);
  while (!isCourtDay(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function addCourtDays(date, n) {
  if (n === 0) {
    return isCourtDay(date) ? new Date(date) : adjustForwardToCourtDay(date);
  }
  const step = n > 0 ? 1 : -1;
  let count = 0;
  const d = new Date(date);

  while (count < Math.abs(n)) {
    d.setDate(d.getDate() + step);
    if (isCourtDay(d)) count++;
  }
  return d;
}

function addDays(date, n, opts) {
  opts = opts || {};
  const useCourtDays = opts.useCourtDays || false;

  if (useCourtDays) return addCourtDays(date, n);

  const candidate = addCalendarDaysFn(date, n);
  if (!isCourtDay(candidate)) {
    return n >= 0
      ? adjustForwardToCourtDay(candidate)
      : adjustBackwardToCourtDay(candidate);
  }
  return candidate;
}

function calculateDates(startDate, differentials, useCourtDays) {
  const results = {};

  for (let i = 0; i < differentials.length; i++) {
    const diff = differentials[i];
    const date = addDays(startDate, diff, {
      useCourtDays: useCourtDays
    });
    results[diff] = toLocalIso(date);
  }

  return results;
}