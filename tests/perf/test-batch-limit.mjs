// Tests for Fix #10: Firestore batch limit 500
// Tests the commitInBatches chunking logic
// NOTE: store.js imports Firebase, so we replicate the exact logic here for testing

let passed = 0, failed = 0;
const failures = [];
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

console.log("=== BATCH LIMIT FIX TESTS ===\n");

// ============================================================
// Exact replica of the commitInBatches logic from store.js
// ============================================================
const BATCH_LIMIT = 400;

// Simulates commitInBatches: splits ops into chunks and tracks each batch
function simulateCommitInBatches(operations) {
  const batches = [];
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    const batchOps = [];
    for (const op of chunk) {
      batchOps.push(op);
    }
    batches.push(batchOps);
  }
  return batches;
}

// ============================================================
// COMPARATIVE: Old approach (single batch) vs new (chunked)
// ============================================================
console.log("--- COMPARATIVE: Old single-batch vs new chunked approach ---");
{
  // Old approach: 600 ops in one writeBatch — Firestore limit is 500 → CRASH
  const opsCount = 600;
  const wouldFailOld = opsCount > 500;
  assert(wouldFailOld, "Old approach would fail with 600 ops in single batch");

  // New approach: chunks of 400
  const ops = Array.from({ length: opsCount }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
  const batches = simulateCommitInBatches(ops);
  const maxBatchSize = Math.max(...batches.map(b => b.length));
  assert(maxBatchSize <= 400, `New approach: max batch size = ${maxBatchSize}, should be ≤400`);
  assert(!( maxBatchSize > 500), "New approach should never exceed Firestore's 500 limit");
}

// ============================================================
// Bug #1: Zero operations should produce 0 batches
// ============================================================
console.log("--- Bug #1: Zero operations ---");
{
  const batches = simulateCommitInBatches([]);
  assert(batches.length === 0, "0 operations should produce 0 batches");
}

// ============================================================
// Bug #2: Exactly 400 ops → 1 batch
// ============================================================
console.log("--- Bug #2: Exactly 400 operations ---");
{
  const ops = Array.from({ length: 400 }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 1, `400 ops → 1 batch, got ${batches.length}`);
  assert(batches[0].length === 400, `Batch has 400 ops, got ${batches[0].length}`);
}

// ============================================================
// Bug #3: 401 ops → 2 batches (400 + 1)
// ============================================================
console.log("--- Bug #3: 401 operations ---");
{
  const ops = Array.from({ length: 401 }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 2, `401 ops → 2 batches, got ${batches.length}`);
  assert(batches[0].length === 400, `First batch = 400`);
  assert(batches[1].length === 1, `Second batch = 1`);
}

// ============================================================
// Bug #4: 800 ops → 2 batches of 400
// ============================================================
console.log("--- Bug #4: 800 operations ---");
{
  const ops = Array.from({ length: 800 }, (_, i) => ({ type: "set", ref: `ref-${i}`, data: {} }));
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 2, `800 → 2 batches`);
  assert(batches[0].length === 400 && batches[1].length === 400, "Both batches = 400");
}

// ============================================================
// Bug #5: 1200 ops (extreme clearAllData with many forms)
// ============================================================
console.log("--- Bug #5: 1200 operations ---");
{
  const ops = Array.from({ length: 1200 }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 3, `1200 → 3 batches, got ${batches.length}`);
  const total = batches.reduce((s, b) => s + b.length, 0);
  assert(total === 1200, `Total ops = 1200, got ${total}`);
}

// ============================================================
// Bug #6: Mixed operation types preserved in order
// ============================================================
console.log("--- Bug #6: Mixed operation types preserved ---");
{
  const ops = [
    { type: "set", ref: "r1", data: { a: 1 } },
    { type: "delete", ref: "r2" },
    { type: "update", ref: "r3", data: { b: 2 } },
    { type: "set", ref: "r4", data: { c: 3 } },
  ];
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 1, "4 ops → 1 batch");
  assert(batches[0][0].type === "set", "First = set");
  assert(batches[0][1].type === "delete", "Second = delete");
  assert(batches[0][2].type === "update", "Third = update");
  assert(batches[0][3].type === "set", "Fourth = set");
}

// ============================================================
// Bug #7: Single operation
// ============================================================
console.log("--- Bug #7: Single operation ---");
{
  const batches = simulateCommitInBatches([{ type: "set", ref: "r1", data: {} }]);
  assert(batches.length === 1, "1 op → 1 batch");
  assert(batches[0].length === 1, "Batch has 1 op");
}

// ============================================================
// Bug #8: 500 ops — the old breaking point
// ============================================================
console.log("--- Bug #8: 500 ops (old breaking point) ---");
{
  const ops = Array.from({ length: 500 }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 2, `500 → 2 batches, got ${batches.length}`);
  for (const b of batches) {
    assert(b.length <= 400, `No batch exceeds 400, got ${b.length}`);
  }
}

// ============================================================
// Bug #9: Data integrity — no ops lost, no ops duplicated
// ============================================================
console.log("--- Bug #9: Data integrity across batches ---");
{
  const ops = Array.from({ length: 950 }, (_, i) => ({ type: "delete", ref: `ref-${i}`, idx: i }));
  const batches = simulateCommitInBatches(ops);
  const allOps = batches.flat();
  assert(allOps.length === 950, `Total ops = 950, got ${allOps.length}`);
  for (let i = 0; i < 950; i++) {
    assert(allOps[i].idx === i, `Op ${i} should have idx ${i}`);
  }
}

// ============================================================
// Bug #10: Multiple boundary values
// ============================================================
console.log("--- Bug #10: Boundary values ---");
{
  for (const count of [1, 399, 400, 401, 499, 500, 501, 799, 800, 801, 1000]) {
    const ops = Array.from({ length: count }, (_, i) => ({ type: "delete", ref: `ref-${i}` }));
    const batches = simulateCommitInBatches(ops);
    const expected = Math.ceil(count / BATCH_LIMIT);
    assert(batches.length === expected, `${count} ops → ${expected} batches, got ${batches.length}`);
    const total = batches.reduce((s, b) => s + b.length, 0);
    assert(total === count, `Total ops = ${count}, got ${total}`);
    for (const b of batches) {
      assert(b.length <= BATCH_LIMIT, `Batch size ${b.length} should not exceed ${BATCH_LIMIT}`);
    }
  }
}

// ============================================================
// Bug #11: clearAllData scenario — forms + 5 game docs
// ============================================================
console.log("--- Bug #11: clearAllData scenario with 600 forms ---");
{
  // Simulate: 600 form deletes + 5 game doc sets = 605 operations
  const ops = [];
  for (let i = 0; i < 600; i++) {
    ops.push({ type: "delete", ref: `predictions/form-${i}` });
  }
  ops.push({ type: "set", ref: "gameData/users", data: { data: {} } });
  ops.push({ type: "set", ref: "gameData/matchResults", data: { data: {} } });
  ops.push({ type: "set", ref: "gameData/actualAdvancing", data: { data: {} } });
  ops.push({ type: "set", ref: "gameData/actualBonuses", data: {} });
  ops.push({ type: "set", ref: "gameData/settings", data: {} });

  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 2, `605 ops → 2 batches, got ${batches.length}`);
  const total = batches.reduce((s, b) => s + b.length, 0);
  assert(total === 605, `Total = 605, got ${total}`);
  // Game doc operations end up in second batch (at positions 600-604)
  const lastBatch = batches[batches.length - 1];
  const setOps = lastBatch.filter(op => op.type === "set");
  assert(setOps.length === 5, `Last batch should contain the 5 set ops, got ${setOps.length}`);
}

// ============================================================
// Bug #12: importAllData scenario — delete old + create new
// ============================================================
console.log("--- Bug #12: importAllData scenario ---");
{
  // Simulate: 5 gameData sets + 300 existing deletes + 400 new form sets = 705
  const ops = [];
  for (let i = 0; i < 5; i++) {
    ops.push({ type: "set", ref: `gameData/key${i}`, data: {} });
  }
  for (let i = 0; i < 300; i++) {
    ops.push({ type: "delete", ref: `predictions/old-${i}` });
  }
  for (let i = 0; i < 400; i++) {
    ops.push({ type: "set", ref: `predictions/new-${i}`, data: {} });
  }

  const batches = simulateCommitInBatches(ops);
  assert(batches.length === 2, `705 ops → 2 batches, got ${batches.length}`);
  const total = batches.reduce((s, b) => s + b.length, 0);
  assert(total === 705, `Total = 705`);
}

// ============================================================
// Summary
// ============================================================
console.log("");
if (failures.length > 0) {
  console.log("FAILURES:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
console.log(`\n=== BATCH LIMIT FIX: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
