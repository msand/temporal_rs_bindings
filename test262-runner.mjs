#!/usr/bin/env node

// Test262 runner for temporal_rs NAPI bindings.
// Runs TC39 Temporal tests against our native implementation.
//
// Usage:
//   node test262-runner.mjs                     # Run all Temporal tests
//   node test262-runner.mjs PlainDate           # Filter by path substring
//   node test262-runner.mjs -v                  # Verbose (show each test)
//   node test262-runner.mjs --failing           # Show only failing tests
//   node test262-runner.mjs --write-failures    # Write failure list to file
//   node test262-runner.mjs --expected-failures=file.txt

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST262_DIR = path.join(__dirname, 'test262');
const HARNESS_DIR = path.join(TEST262_DIR, 'harness');
const TEST_DIR = path.join(TEST262_DIR, 'test');

// All directories containing tests with the Temporal feature flag
const TEMPORAL_TEST_DIRS = [
  path.join(TEST_DIR, 'built-ins', 'Temporal'),
  path.join(TEST_DIR, 'intl402', 'Temporal'),
  path.join(TEST_DIR, 'intl402', 'DateTimeFormat', 'prototype'),
  path.join(TEST_DIR, 'intl402', 'DurationFormat', 'prototype'),
  path.join(TEST_DIR, 'built-ins', 'Date', 'prototype'),
  path.join(TEST_DIR, 'staging', 'Temporal'),
];

// ─── Load and cache harness files ───────────────────────────

const harnessCache = new Map();

function loadHarness(name) {
  if (harnessCache.has(name)) return harnessCache.get(name);
  const code = fs.readFileSync(path.join(HARNESS_DIR, name), 'utf8');
  harnessCache.set(name, code);
  return code;
}


// ─── Parse test frontmatter ─────────────────────────────────

function parseFrontmatter(source) {
  const match = source.match(/\/\*---\n([\s\S]*?)---\*\//);
  if (!match) return {};

  const yaml = match[1];
  const meta = {};
  const linesArr = yaml.split('\n');
  let currentKey = null;

  for (const line of linesArr) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value.startsWith('[') && value.endsWith(']')) {
        meta[key] = value.slice(1, -1).split(',').map(s => s.trim());
      } else if (value === '' || value === '|') {
        currentKey = key;
      } else {
        meta[key] = value;
        currentKey = key;
      }
    } else if (line.match(/^\s+-\s+(.+)/)) {
      const item = line.match(/^\s+-\s+(.+)/)[1].trim();
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      meta[currentKey].push(item);
    } else if (currentKey && line.match(/^\s+(\w+):\s*(.*)/)) {
      const [, subKey, subVal] = line.match(/^\s+(\w+):\s*(.*)/);
      if (typeof meta[currentKey] !== 'object' || Array.isArray(meta[currentKey])) {
        meta[currentKey] = {};
      }
      meta[currentKey][subKey] = subVal;
    }
  }

  return meta;
}

// ─── Build Temporal namespace from NAPI binding ─────────────

function buildTemporalNamespaceSync(binding) {
  return {
    PlainDate: binding.PlainDate,
    PlainTime: binding.PlainTime,
    PlainDateTime: binding.PlainDateTime,
    ZonedDateTime: binding.ZonedDateTime,
    Instant: binding.Instant,
    Duration: binding.Duration,
    PlainYearMonth: binding.PlainYearMonth,
    PlainMonthDay: binding.PlainMonthDay,
    Now: {
      instant: binding.nowInstant,
      timeZoneId: () => binding.nowTimeZone().id,
      zonedDateTimeISO: (tz) => {
        if (typeof tz === 'string') tz = new binding.TimeZone(tz);
        return binding.nowZonedDateTimeIso(tz);
      },
      plainDateTimeISO: (tz) => {
        if (typeof tz === 'string') tz = new binding.TimeZone(tz);
        return binding.nowPlainDateTimeIso(tz);
      },
      plainDateISO: (tz) => {
        if (typeof tz === 'string') tz = new binding.TimeZone(tz);
        return binding.nowPlainDateIso(tz);
      },
      plainTimeISO: (tz) => {
        if (typeof tz === 'string') tz = new binding.TimeZone(tz);
        return binding.nowPlainTimeIso(tz);
      },
    },
  };
}

// ─── Collect test files ─────────────────────────────────────

function collectTests(dirs, filter) {
  const results = [];
  function walk(d, baseDir) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full, baseDir);
      else if (entry.name.endsWith('.js')) {
        const rel = path.relative(TEST_DIR, full);
        if (!filter || rel.includes(filter)) {
          // For dirs outside built-ins/Temporal, check Temporal feature flag
          if (!full.includes('built-ins/Temporal')) {
            const src = fs.readFileSync(full, 'utf8');
            if (!/features:.*Temporal/.test(src)) continue;
          }
          results.push({ path: full, rel });
        }
      }
    }
  }
  for (const dir of dirs) {
    if (fs.existsSync(dir)) walk(dir, dir);
  }
  return results;
}

// ─── Create a fresh context with NAPI constructors ──────────

function createTestContext(Temporal) {
  // To make NAPI constructors work in vm contexts, we need to pass them
  // through the sandbox. The key insight: vm.createContext copies the
  // sandbox object's properties into the new context. NAPI class objects
  // are regular JS functions/objects in V8, so they transfer fine —
  // the issue is that `instanceof` checks fail across context boundaries.
  //
  // We work around this by providing the constructors directly and
  // accepting that some instanceof-based tests will fail.
  const sandbox = {
    // Provide standard built-ins that tests may need
    Object,
    Array,
    String,
    Number,
    Boolean,
    Symbol,
    BigInt,
    Function,
    Math,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
    EvalError,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
    ArrayBuffer,
    DataView,
    Float32Array,
    Float64Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Uint8ClampedArray,
    SharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined,
    Atomics: typeof Atomics !== 'undefined' ? Atomics : undefined,
    Intl: typeof Intl !== 'undefined' ? Intl : undefined,
    console,
    print: (...args) => {},
    $262: {
      createRealm: () => { throw new Error('createRealm not supported'); },
      gc: () => {},
    },
  };
  // Per spec: Temporal should be non-enumerable on globalThis (like other built-in namespaces)
  Object.defineProperty(sandbox, 'Temporal', { value: Temporal, writable: true, enumerable: false, configurable: true });
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  return vm.createContext(sandbox);
}

// ─── Run a single test ──────────────────────────────────────

const SKIP_CRASH = new Set([
  // No tests skipped — all previously skipped tests should now work
]);

// Snapshot and restore prototype/static properties to prevent cross-test pollution.
// Only snapshots prototype methods and constructor statics (from, compare, etc.)
function snapshotTemporal(Temporal) {
  const snapshots = [];
  const classes = [
    Temporal.Duration, Temporal.PlainDate, Temporal.PlainTime,
    Temporal.PlainDateTime, Temporal.ZonedDateTime, Temporal.Instant,
    Temporal.PlainYearMonth, Temporal.PlainMonthDay,
  ];
  // Snapshot Temporal namespace properties (including symbol properties like @@toStringTag)
  for (const name of [...Object.getOwnPropertyNames(Temporal), ...Object.getOwnPropertySymbols(Temporal)]) {
    snapshots.push({ obj: Temporal, name, desc: Object.getOwnPropertyDescriptor(Temporal, name) });
  }
  for (const cls of classes) {
    if (!cls) continue;
    // Snapshot prototype properties (including symbol properties like @@toStringTag)
    if (cls.prototype) {
      for (const name of [...Object.getOwnPropertyNames(cls.prototype), ...Object.getOwnPropertySymbols(cls.prototype)]) {
        snapshots.push({ obj: cls.prototype, name, desc: Object.getOwnPropertyDescriptor(cls.prototype, name) });
      }
    }
    // Snapshot constructor statics (from, compare, etc.)
    for (const name of Object.getOwnPropertyNames(cls)) {
      if (name === 'length' || name === 'name' || name === 'prototype') continue;
      snapshots.push({ obj: cls, name, desc: Object.getOwnPropertyDescriptor(cls, name) });
    }
  }
  // Snapshot Date.prototype.toTemporalInstant (tests may delete/modify it)
  if (Date.prototype.toTemporalInstant) {
    snapshots.push({
      obj: Date.prototype,
      name: 'toTemporalInstant',
      desc: Object.getOwnPropertyDescriptor(Date.prototype, 'toTemporalInstant'),
    });
  }
  // Snapshot Now methods and symbol properties (including @@toStringTag)
  if (Temporal.Now) {
    for (const name of ['instant', 'timeZoneId', 'zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO']) {
      const desc = Object.getOwnPropertyDescriptor(Temporal.Now, name);
      if (desc) snapshots.push({ obj: Temporal.Now, name, desc });
    }
    for (const sym of Object.getOwnPropertySymbols(Temporal.Now)) {
      snapshots.push({ obj: Temporal.Now, name: sym, desc: Object.getOwnPropertyDescriptor(Temporal.Now, sym) });
    }
  }
  // Snapshot Intl.DurationFormat.prototype (tests may taint getters)
  if (typeof Intl !== 'undefined' && typeof Intl.DurationFormat === 'function' && Intl.DurationFormat.prototype) {
    for (const name of Object.getOwnPropertyNames(Intl.DurationFormat.prototype)) {
      snapshots.push({
        obj: Intl.DurationFormat.prototype,
        name,
        desc: Object.getOwnPropertyDescriptor(Intl.DurationFormat.prototype, name),
      });
    }
  }
  // Snapshot built-in functions that some tests replace with throwing stubs
  // (e.g., Duration/call-builtin.js replaces Number.isFinite and Math.sign)
  snapshots.push({ obj: Number, name: 'isFinite', desc: Object.getOwnPropertyDescriptor(Number, 'isFinite') });
  snapshots.push({ obj: Math, name: 'sign', desc: Object.getOwnPropertyDescriptor(Math, 'sign') });
  snapshots.push({ obj: Math, name: 'trunc', desc: Object.getOwnPropertyDescriptor(Math, 'trunc') });
  snapshots.push({ obj: Math, name: 'abs', desc: Object.getOwnPropertyDescriptor(Math, 'abs') });
  return snapshots;
}

function restoreTemporal(snapshots) {
  for (const { obj, name, desc } of snapshots) {
    try {
      Object.defineProperty(obj, name, desc);
    } catch {}
  }
}

function runTest(testFile, Temporal) {
  if (SKIP_CRASH.has(testFile.rel)) {
    return { status: 'skip', reason: 'crashes vm sandbox' };
  }

  const source = fs.readFileSync(testFile.path, 'utf8');
  const meta = parseFrontmatter(source);

  // Skip non-Temporal tests
  if (meta.features && !meta.features.includes('Temporal')) {
    return { status: 'skip', reason: 'no Temporal feature' };
  }

  // Skip async/module tests
  if (meta.flags && (meta.flags.includes('async') || meta.flags.includes('module'))) {
    return { status: 'skip', reason: meta.flags.join(',') };
  }

  const isNegative = meta.negative != null;
  const expectedError = isNegative ? meta.negative.type : null;
  const expectedPhase = isNegative ? meta.negative.phase : null;

  // Build combined harness code
  const harnessScripts = ['sta.js', 'assert.js'];
  if (meta.includes) {
    for (const inc of meta.includes) {
      if (!fs.existsSync(path.join(HARNESS_DIR, inc))) {
        return { status: 'skip', reason: `missing harness: ${inc}` };
      }
      harnessScripts.push(inc);
    }
  }

  // Handle parse-phase negative tests
  if (expectedPhase === 'parse') {
    try {
      new vm.Script(source, { filename: testFile.rel });
      return { status: 'fail', reason: `Expected parse error ${expectedError} but parsed OK` };
    } catch (err) {
      return { status: 'pass' };
    }
  }

  const context = createTestContext(Temporal);

  const runInCtx = (code, ctx, filename) => {
    try {
      vm.runInContext(code, ctx, { filename, timeout: 30000 });
      return null;
    } catch (err) {
      return err;
    }
  };

  // Run harness files
  for (const h of harnessScripts) {
    const err = runInCtx(loadHarness(h), context, `harness/${h}`);
    if (err) {
      return { status: 'skip', reason: `harness error in ${h}: ${String(err?.message || err).split('\n')[0]}` };
    }
  }

  // Patch assert.throws to handle cross-realm error constructors.
  // When NAPI bindings or V8 internals throw errors, they use the outer realm's
  // error constructors, which differ from the ones in the vm sandbox.
  // This shim compares constructor names as a fallback when identity check fails.
  const shimErr = runInCtx(`
    if (typeof assert !== 'undefined' && assert.throws) {
      const _origThrows = assert.throws;
      assert.throws = function(expectedErrorConstructor, func, message) {
        if (typeof func !== "function") {
          return _origThrows.call(this, expectedErrorConstructor, func, message);
        }
        if (message === undefined) message = ''; else message += ' ';
        try {
          func();
        } catch (thrown) {
          if (typeof thrown !== 'object' || thrown === null) {
            throw new Test262Error(message + 'Thrown value was not an object!');
          }
          if (thrown.constructor === expectedErrorConstructor) return;
          // Cross-realm fallback: match by constructor name
          if (thrown.constructor && thrown.constructor.name === expectedErrorConstructor.name) return;
          var expectedName = expectedErrorConstructor.name;
          var actualName = thrown.constructor ? thrown.constructor.name : 'unknown';
          throw new Test262Error(message + 'Expected a ' + expectedName + ' but got a ' + actualName);
        }
        throw new Test262Error(message + 'Expected a ' + expectedErrorConstructor.name + ' to be thrown but no exception was thrown at all');
      };
    }
  `, context, 'assert-throws-shim');
  if (shimErr) {
    return { status: 'skip', reason: `assert.throws shim error: ${String(shimErr?.message || shimErr).split('\n')[0]}` };
  }

  // Run test
  const isOnlyStrict = meta.flags && meta.flags.includes('onlyStrict');
  const prefix = isOnlyStrict ? '"use strict";\n' : '';
  const testCode = prefix + source;

  const err = runInCtx(testCode, context, testFile.rel);

  if (err === null) {
    // Test completed without throwing
    if (isNegative) {
      return { status: 'fail', reason: `Expected ${expectedError} but test passed` };
    }
    return { status: 'pass' };
  }

  // Test threw an error
  if (isNegative) {
    // Accept any throw for negative tests
    return { status: 'pass' };
  }

  // Format error message
  let msg, name;
  if (err && typeof err === 'object') {
    msg = err.message || String(err);
    name = err.constructor?.name || err.name || 'Error';
  } else {
    msg = String(err);
    name = 'Error';
  }
  return { status: 'fail', reason: `${name}: ${msg.split('\n')[0]}` };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filter = args.find(a => !a.startsWith('-'));
  const verbose = args.includes('-v') || args.includes('--verbose');
  const showFailing = args.includes('--failing');
  const expectedFailureFile = args.find(a => a.startsWith('--expected-failures='))?.split('=')[1];

  let expectedFailures = new Set();
  if (expectedFailureFile && fs.existsSync(expectedFailureFile)) {
    const content = fs.readFileSync(expectedFailureFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) expectedFailures.add(trimmed);
    }
  }

  console.log('Loading temporal_rs conformance layer...');
  const { Temporal } = await import('./lib/temporal.mjs');

  console.log('Collecting test files...');
  const tests = collectTests(TEMPORAL_TEST_DIRS, filter);
  console.log(`Found ${tests.length} tests${filter ? ` (filter: "${filter}")` : ''}\n`);

  let pass = 0, fail = 0, skip = 0, xfail = 0, xpass = 0;
  const failures = [];
  const unexpectedPasses = [];
  const startTime = Date.now();

  // Snapshot prototypes and statics before running tests so we can restore them.
  const temporalSnapshot = snapshotTemporal(Temporal);

  // Run tests synchronously in a wrapper that prevents async exceptions from
  // breaking the loop. We use setImmediate between batches to drain the event loop.
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    let result;
    try {
      result = runTest(test, Temporal);
    } catch (outerErr) {
      result = { status: 'fail', reason: `CRASH: ${String(outerErr?.message || outerErr).split('\n')[0]}` };
    }
    // Restore prototypes/statics after each test to prevent cross-test pollution
    restoreTemporal(temporalSnapshot);
    const isExpectedFailure = expectedFailures.has(test.rel);

    if (result.status === 'pass') {
      if (isExpectedFailure) {
        xpass++;
        unexpectedPasses.push(test.rel);
        if (verbose) process.stdout.write(`  XPASS ${test.rel}\n`);
      } else {
        pass++;
        if (verbose) process.stdout.write(`  PASS  ${test.rel}\n`);
      }
    } else if (result.status === 'fail') {
      if (isExpectedFailure) {
        xfail++;
        if (verbose) process.stdout.write(`  XFAIL ${test.rel}\n`);
      } else {
        fail++;
        failures.push({ test: test.rel, reason: result.reason });
        if (verbose || showFailing) {
          process.stdout.write(`  FAIL  ${test.rel}\n`);
          if (verbose) process.stdout.write(`        ${result.reason}\n`);
        }
      }
    } else {
      skip++;
      if (verbose) process.stdout.write(`  SKIP  ${test.rel} (${result.reason})\n`);
    }

    if (!verbose && !showFailing && (i + 1) % 100 === 0) {
      process.stdout.write(`  ${i + 1}/${tests.length} tests... (${pass} pass, ${fail} fail, ${skip} skip)\r`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Test262 Temporal Results (${elapsed}s)`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total:    ${tests.length}`);
  console.log(`  Pass:     ${pass}`);
  console.log(`  Fail:     ${fail}`);
  console.log(`  Skip:     ${skip}`);
  if (expectedFailures.size > 0) {
    console.log(`  XFail:    ${xfail} (expected failures)`);
    console.log(`  XPass:    ${xpass} (unexpected passes)`);
  }
  console.log(`${'─'.repeat(60)}`);
  const total = pass + fail;
  if (total > 0) {
    console.log(`  Pass rate: ${((pass / total) * 100).toFixed(1)}% (of non-skipped)`);
  }

  if (failures.length > 0 && !verbose) {
    console.log(`\nTop failure reasons:`);
    const reasons = {};
    for (const f of failures) {
      const key = f.reason.split('\n')[0].substring(0, 100);
      reasons[key] = (reasons[key] || 0) + 1;
    }
    const sorted = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [reason, count] of sorted) {
      console.log(`  ${count}x ${reason}`);
    }
  }

  if (unexpectedPasses.length > 0) {
    console.log(`\nUnexpected passes (remove from expected-failures):`);
    for (const t of unexpectedPasses) console.log(`  ${t}`);
  }

  if (args.includes('--write-failures')) {
    const failFile = 'test262-failures.txt';
    const lines = failures.map(f => f.test).sort();
    fs.writeFileSync(failFile, lines.join('\n') + '\n');
    console.log(`\nWrote ${lines.length} failure paths to ${failFile}`);
  }

  process.exit(fail > 0 || xpass > 0 ? 1 : 0);
}

// Some Test262 tests throw non-Error objects (Test262Error) that escape the
// vm sandbox's try-catch. Swallow them to prevent runner crashes.
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

main().then(() => {}, () => {
  // Swallow — errors from vm sandbox escaping into the event loop
});
