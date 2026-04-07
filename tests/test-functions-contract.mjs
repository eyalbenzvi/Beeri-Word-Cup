// Tests for Netlify Functions: validate request/response structure, error handling,
// and API contract (no actual API calls — only tests the function logic)

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error("  FAIL: " + m); } }

console.log("=== NETLIFY FUNCTIONS & API CONTRACT TESTS ===\n");

// ---- 1. Groq API contract: only supported params ----
console.log("--- 1. Groq API contract: supported params ---");
const GROQ_SUPPORTED_PARAMS = new Set([
  'messages', 'model', 'temperature', 'max_tokens', 'top_p', 'n',
  'stream', 'stop', 'presence_penalty', 'frequency_penalty',
  'logit_bias', 'user', 'response_format', 'tools', 'tool_choice',
  'seed', 'logprobs', 'top_logprobs',
]);

const GROQ_UNSUPPORTED_PARAMS = ['timeout', 'api_key', 'apiKey', 'headers', 'baseURL'];

// Read the function files and check for unsupported params
import { readFileSync } from 'fs';

const batchFile = readFileSync('/home/user/Beeri-World-Cup/netlify/functions/batch-analysis.js', 'utf8');
const matchFile = readFileSync('/home/user/Beeri-World-Cup/netlify/functions/match-analysis.js', 'utf8');

for (const param of GROQ_UNSUPPORTED_PARAMS) {
  // Check if param appears inside a create() call (not in comments or strings)
  const batchHas = batchFile.includes(`${param}:`) || batchFile.includes(`${param} :`);
  const matchHas = matchFile.includes(`${param}:`) || matchFile.includes(`${param} :`);

  // Filter: only flag if it's inside a .create({ ... }) block
  if (param === 'timeout') {
    const batchCreate = batchFile.match(/\.create\(\{[\s\S]*?\}\)/g) || [];
    const matchCreate = matchFile.match(/\.create\(\{[\s\S]*?\}\)/g) || [];
    const batchInCreate = batchCreate.some(block => block.includes('timeout'));
    const matchInCreate = matchCreate.some(block => block.includes('timeout'));
    assert(!batchInCreate, `batch-analysis: 'timeout' NOT in .create() call`);
    assert(!matchInCreate, `match-analysis: 'timeout' NOT in .create() call`);
  }
}

// ---- 2. Function: handles missing API key ----
console.log("--- 2. Missing API key handling ---");
assert(batchFile.includes('GROQ_API_KEY'), "batch-analysis checks for GROQ_API_KEY");
assert(matchFile.includes('GROQ_API_KEY'), "match-analysis checks for GROQ_API_KEY");

// Check that missing key returns error, not crashes
assert(batchFile.includes('"Missing GROQ_API_KEY"') || batchFile.includes("Missing GROQ_API_KEY"), "batch-analysis returns error for missing key");
assert(matchFile.includes('"Missing GROQ_API_KEY"') || matchFile.includes("Missing GROQ_API_KEY"), "match-analysis returns error for missing key");

// ---- 3. Function: handles invalid JSON body ----
console.log("--- 3. Invalid JSON handling ---");
assert(batchFile.includes('JSON.parse') && batchFile.includes('catch'), "batch-analysis catches JSON parse errors");
assert(matchFile.includes('JSON.parse') && matchFile.includes('catch'), "match-analysis catches JSON parse errors");

// ---- 4. Function: handles missing required fields ----
console.log("--- 4. Missing fields handling ---");
assert(batchFile.includes('Missing') || batchFile.includes('missing'), "batch-analysis validates required fields");
assert(matchFile.includes('Missing') || matchFile.includes('missing'), "match-analysis validates required fields");

// ---- 5. Function: returns proper HTTP status codes ----
console.log("--- 5. HTTP status codes ---");
assert(batchFile.includes('statusCode: 400'), "batch-analysis returns 400 for bad request");
assert(batchFile.includes('statusCode: 500'), "batch-analysis returns 500 for server error");
assert(batchFile.includes('statusCode: 502'), "batch-analysis returns 502 for API error");
assert(batchFile.includes('statusCode: 200'), "batch-analysis returns 200 for success");
assert(batchFile.includes('statusCode: 405'), "batch-analysis returns 405 for wrong method");

assert(matchFile.includes('statusCode: 400'), "match-analysis returns 400 for bad request");
assert(matchFile.includes('statusCode: 500'), "match-analysis returns 500 for server error");
assert(matchFile.includes('statusCode: 502'), "match-analysis returns 502 for API error");
assert(matchFile.includes('statusCode: 200'), "match-analysis returns 200 for success");
assert(matchFile.includes('statusCode: 405'), "match-analysis returns 405 for wrong method");

// ---- 6. Function: returns JSON content type ----
console.log("--- 6. JSON content type ---");
assert(batchFile.includes('"Content-Type": "application/json"'), "batch-analysis sets JSON content type");
assert(matchFile.includes('"Content-Type": "application/json"'), "match-analysis sets JSON content type");

// ---- 7. Function: error responses include error field ----
console.log("--- 7. Error response structure ---");
// All error responses should have { error: "..." }
const batchErrorReturns = (batchFile.match(/body: JSON\.stringify\(\{[^}]*error/g) || []).length;
assert(batchErrorReturns >= 3, `batch-analysis has ${batchErrorReturns} error responses with 'error' field (expected >=3)`);
const matchErrorReturns = (matchFile.match(/body: JSON\.stringify\(\{[^}]*error/g) || []).length;
assert(matchErrorReturns >= 3, `match-analysis has ${matchErrorReturns} error responses with 'error' field (expected >=3)`);

// ---- 8. Function: POST only ----
console.log("--- 8. POST method enforcement ---");
assert(batchFile.includes('httpMethod') && batchFile.includes('"POST"'), "batch-analysis enforces POST");
assert(matchFile.includes('httpMethod') && matchFile.includes('"POST"'), "match-analysis enforces POST");

// ---- 9. Response format: JSON mode enabled ----
console.log("--- 9. JSON response format ---");
assert(batchFile.includes('response_format') && batchFile.includes('json_object'), "batch-analysis uses JSON response format");
assert(matchFile.includes('response_format') && matchFile.includes('json_object'), "match-analysis uses JSON response format");

// ---- 10. Model name is valid ----
console.log("--- 10. Model name ---");
const validModels = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
const batchModel = batchFile.match(/model:\s*"([^"]+)"/);
const matchModel = matchFile.match(/model:\s*"([^"]+)"/);
assert(batchModel && validModels.includes(batchModel[1]), `batch-analysis model "${batchModel?.[1]}" is valid`);
assert(matchModel && validModels.includes(matchModel[1]), `match-analysis model "${matchModel?.[1]}" is valid`);

// ---- 11. No setState during render (React anti-pattern check) ----
console.log("--- 11. No setState during render ---");
const jsxFiles = [
  '/home/user/Beeri-World-Cup/src/pages/Predict.jsx',
  '/home/user/Beeri-World-Cup/src/pages/Leaderboard.jsx',
  '/home/user/Beeri-World-Cup/src/pages/Stats.jsx',
  '/home/user/Beeri-World-Cup/src/pages/Home.jsx',
  '/home/user/Beeri-World-Cup/src/pages/Admin.jsx',
];

for (const filePath of jsxFiles) {
  const content = readFileSync(filePath, 'utf8');
  const fileName = filePath.split('/').pop();

  // Look for render functions that call setState
  // Pattern: function that returns JSX and calls set* inside it (not in callbacks)
  const renderFunctions = content.match(/const render\w+ = \(\) => \{[\s\S]*?\n  \};/g) || [];
  for (const fn of renderFunctions) {
    const fnName = fn.match(/const (render\w+)/)?.[1];
    // Check for setState calls that aren't inside onClick/onChange/useEffect callbacks
    const lines = fn.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/\bset[A-Z]\w+\(/) && !line.includes('onClick') && !line.includes('onChange') && !line.includes('=>')) {
        // Potential setState in render body
        assert(false, `${fileName}: ${fnName} may call setState during render (line contains set*())`);
      }
    }
  }
}

// ---- 12. Store: no unsupported Firestore params ----
console.log("--- 12. Firestore API contract ---");
const storeFile = readFileSync('/home/user/Beeri-World-Cup/src/store.js', 'utf8');
// Check that setDoc calls don't include unsupported params
assert(!storeFile.includes('merge: true'), "store.js: no merge:true in setDoc (use updateDoc for merges)");

// ---- 13. Security: no hardcoded API keys in source ----
console.log("--- 13. No hardcoded API keys ---");
const srcFiles = [batchFile, matchFile, storeFile];
for (const content of srcFiles) {
  assert(!content.includes('AIzaSy'), "No hardcoded Firebase API key in source");
  assert(!content.includes('gsk_'), "No hardcoded Groq API key in source");
  assert(!content.includes('sk-'), "No hardcoded OpenAI-style key in source");
}

// ---- 14. enforceVariety: output validation ----
console.log("--- 14. enforceVariety function ---");
assert(batchFile.includes('enforceVariety'), "batch-analysis has enforceVariety post-processing");
// Check it handles edge cases
assert(batchFile.includes('results.length <= 2') || batchFile.includes('results.length < 2'), "enforceVariety handles small arrays");

console.log(`\n=== FUNCTIONS & CONTRACT RESULTS: ${passed} passed, ${failed} failed ===`);
if (failures.length) { console.log("\nFAILURES:"); failures.forEach(f => console.log("  - " + f)); }
process.exit(failed > 0 ? 1 : 0);
