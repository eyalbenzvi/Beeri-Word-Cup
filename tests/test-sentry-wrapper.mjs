// Tests for netlify/functions/_sentry.js — the withSentry wrapper.
// זה הקוד הכי מסוכן במימוש Sentry: עוטף handlers של פונקציות קיימות,
// טעות כאן יכולה לשבור endpoints שעובדים בפרודקשן.
//
// הטסטים מבודדים את createWithSentry (factory) עם Sentry מוקי,
// כדי לא להעמיס את @sentry/node האמיתי ולא לגעת ברשת.

import { createWithSentry } from "../netlify/functions/_sentry.js";

let passed = 0,
  failed = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.error("  FAIL: " + msg);
  }
}

function makeMockSentry() {
  const captured = [];
  let flushCount = 0;
  return {
    captureException(err, opts) {
      captured.push({ err, opts });
    },
    async flush(_timeoutMs) {
      flushCount++;
      return true;
    },
    _captured: captured,
    get _flushCount() {
      return flushCount;
    },
  };
}

console.log("=== SENTRY WRAPPER TESTS ===\n");

// ---------- 1. Success path ----------
console.log("--- 1. Handler succeeds → pass-through result ---");
{
  const sentry = makeMockSentry();
  let initCalled = 0;
  const withSentry = createWithSentry(sentry, () => {
    initCalled++;
  });

  const ok = { statusCode: 200, body: JSON.stringify({ ok: true }) };
  const handler = withSentry(async () => ok, "fn-success");
  const res = await handler({ path: "/x", httpMethod: "POST" }, {});

  assert(res === ok, "Returns the exact handler result on success");
  assert(sentry._captured.length === 0, "No error captured on success");
  assert(initCalled === 1, "initFn called exactly once per invocation");
}

// ---------- 2. Handler throws ----------
console.log("--- 2. Handler throws → 500 + captureException ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {});
  const boom = new Error("kaboom");
  const handler = withSentry(async () => {
    throw boom;
  }, "fn-throws");

  const res = await handler({ path: "/api/boom", httpMethod: "GET" }, {});
  assert(res.statusCode === 500, "Returns 500 when handler throws");
  const body = JSON.parse(res.body);
  assert(typeof body.error === "string", "Response body has error string");
  assert(sentry._captured.length === 1, "Sentry.captureException called once");
  assert(sentry._captured[0].err === boom, "Original error forwarded to Sentry");
  assert(
    sentry._captured[0].opts?.tags?.function === "fn-throws",
    "Tagged with function name",
  );
  assert(
    sentry._captured[0].opts?.extra?.path === "/api/boom",
    "Extra includes path",
  );
  assert(sentry._flushCount === 1, "Flush called to avoid losing event");
}

// ---------- 3. Promise rejection ----------
console.log("--- 3. Promise rejection behaves like throw ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {});
  const handler = withSentry(() => Promise.reject(new Error("async fail")), "fn-reject");
  const res = await handler({}, {});
  assert(res.statusCode === 500, "Async reject → 500");
  assert(sentry._captured.length === 1, "Async reject captured");
}

// ---------- 4. Sentry.captureException itself throws ----------
console.log("--- 4. Sentry internals throw → wrapper still returns 500 ---");
{
  const brokenSentry = {
    captureException() {
      throw new Error("sentry broken");
    },
    async flush() {
      throw new Error("flush broken");
    },
  };
  const withSentry = createWithSentry(brokenSentry, () => {});
  const handler = withSentry(async () => {
    throw new Error("user error");
  }, "fn-broken-sentry");

  let threw = false;
  let res;
  try {
    res = await handler({}, {});
  } catch {
    threw = true;
  }
  assert(!threw, "Wrapper does NOT throw even if Sentry itself throws");
  assert(res?.statusCode === 500, "Still returns 500 when Sentry is broken");
}

// ---------- 5. init failure doesn't block handler ----------
console.log("--- 5. initFn throws → handler still runs ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {
    throw new Error("init explode");
  });
  const handler = withSentry(async () => ({ statusCode: 204 }), "fn-init-bad");
  const res = await handler({}, {});
  assert(res.statusCode === 204, "Handler runs despite init failure");
}

// ---------- 6. Business-logic 4xx/5xx are NOT reported ----------
console.log("--- 6. Handler returns non-2xx → not reported ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {});
  const handler = withSentry(
    async () => ({ statusCode: 400, body: '{"error":"bad input"}' }),
    "fn-4xx",
  );
  const res = await handler({}, {});
  assert(res.statusCode === 400, "Handler 4xx passes through unchanged");
  assert(
    sentry._captured.length === 0,
    "Business-logic error responses are NOT sent to Sentry",
  );
}

// ---------- 7. Missing event fields don't crash wrapper ----------
console.log("--- 7. Wrapper survives missing event fields ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {});
  const handler = withSentry(async () => {
    throw new Error("no event");
  }, "fn-no-event");
  let res;
  let threw = false;
  try {
    res = await handler(undefined, undefined);
  } catch {
    threw = true;
  }
  assert(!threw, "Wrapper survives undefined event");
  assert(res?.statusCode === 500, "Still returns 500");
  assert(
    sentry._captured[0]?.opts?.extra?.path === null,
    "Missing path becomes null in extra",
  );
}

// ---------- 8. Default function name fallback ----------
console.log("--- 8. Default function name ---");
{
  const sentry = makeMockSentry();
  const withSentry = createWithSentry(sentry, () => {});
  const handler = withSentry(async () => {
    throw new Error("x");
  }); // no name
  await handler({}, {});
  assert(
    sentry._captured[0].opts.tags.function === "unknown",
    'Defaults to "unknown" when no name given',
  );
}

// ---------- Summary ----------
console.log("\n=== SUMMARY ===");
console.log(`${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
