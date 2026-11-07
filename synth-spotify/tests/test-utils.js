/**
 * Synth Spotify Test Utilities & Assertion Library
 * Native Node.js Test Harness with DOM, Web Audio, and Storage Fixtures
 */

const fs = require('fs');
const path = require('path');

// =========================================================================
// ASSERTION UTILITIES
// =========================================================================
class AssertionError extends Error {
  constructor(message, actual, expected) {
    super(message);
    this.name = 'AssertionError';
    this.actual = actual;
    this.expected = expected;
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new AssertionError(message, condition, true);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const msg = message || `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`;
    throw new AssertionError(msg, actual, expected);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    const msg = message || `Expected deep equality:\nActual:   ${actualStr}\nExpected: ${expectedStr}`;
    throw new AssertionError(msg, actual, expected);
  }
}

function assertInRange(val, min, max, message) {
  if (typeof val !== 'number' || isNaN(val) || val < min || val > max) {
    const msg = message || `Expected ${val} to be between ${min} and ${max}`;
    throw new AssertionError(msg, val, { min, max });
  }
}

function assertThrows(fn, expectedRegexOrMessage, message) {
  let threw = false;
  let errorCaught = null;
  try {
    fn();
  } catch (err) {
    threw = true;
    errorCaught = err;
  }
  if (!threw) {
    throw new AssertionError(message || 'Expected function to throw, but it succeeded', null, 'Error');
  }
  if (expectedRegexOrMessage) {
    const errorMsg = errorCaught.message || String(errorCaught);
    if (expectedRegexOrMessage instanceof RegExp) {
      if (!expectedRegexOrMessage.test(errorMsg)) {
        throw new AssertionError(`Expected error matching ${expectedRegexOrMessage}, got "${errorMsg}"`, errorMsg, expectedRegexOrMessage);
      }
    } else if (typeof expectedRegexOrMessage === 'string') {
      if (!errorMsg.includes(expectedRegexOrMessage)) {
        throw new AssertionError(`Expected error to include "${expectedRegexOrMessage}", got "${errorMsg}"`, errorMsg, expectedRegexOrMessage);
      }
    }
  }
}

async function assertRejects(asyncFn, expectedRegexOrMessage, message) {
  let threw = false;
  let errorCaught = null;
  try {
    await asyncFn();
  } catch (err) {
    threw = true;
    errorCaught = err;
  }
  if (!threw) {
    throw new AssertionError(message || 'Expected async function to reject, but it resolved', null, 'Error');
  }
  if (expectedRegexOrMessage) {
    const errorMsg = errorCaught.message || String(errorCaught);
    if (expectedRegexOrMessage instanceof RegExp) {
      if (!expectedRegexOrMessage.test(errorMsg)) {
        throw new AssertionError(`Expected error matching ${expectedRegexOrMessage}, got "${errorMsg}"`, errorMsg, expectedRegexOrMessage);
      }
    } else if (typeof expectedRegexOrMessage === 'string') {
      if (!errorMsg.includes(expectedRegexOrMessage)) {
        throw new AssertionError(`Expected error to include "${expectedRegexOrMessage}", got "${errorMsg}"`, errorMsg, expectedRegexOrMessage);
      }
    }
  }
}

// =========================================================================
// TEST SUITE RUNNER
// =========================================================================
function createSuite(suiteName) {
  const tests = [];

  function test(testName, fn) {
    tests.push({ name: testName, fn });
  }

  async function run() {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const t of tests) {
      const start = Date.now();
      try {
        await t.fn();
        results.push({ name: t.name, status: 'pass', durationMs: Date.now() - start });
        passed++;
      } catch (err) {
        results.push({
          name: t.name,
          status: 'fail',
          error: err.message,
          stack: err.stack,
          durationMs: Date.now() - start
        });
        failed++;
      }
    }

    return {
      name: suiteName,
      total: tests.length,
      passed,
      failed,
      results
    };
  }

  return { test, run, tests };
}

// =========================================================================
// MOCK ENVIRONMENT FIXTURES (DOM, Web Audio, Storage)
// =========================================================================

class MockAudioParam {
  constructor(initialValue = 0) {
    this._value = initialValue;
    this.scheduledEvents = [];
  }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  setValueAtTime(val, time) {
    this._value = val;
    this.scheduledEvents.push({ type: 'set', val, time });
  }
  setValueCurveAtTime(values, startTime, duration) {
    this.scheduledEvents.push({ type: 'curve', values, startTime, duration, time: startTime });
    if (values && values.length > 0) {
      this._value = values[values.length - 1];
    }
  }
  linearRampToValueAtTime(val, time) {
    this._value = val;
    this.scheduledEvents.push({ type: 'linear', val, time });
  }
  exponentialRampToValueAtTime(val, time) {
    this._value = val;
    this.scheduledEvents.push({ type: 'exponential', val, time });
  }
  setTargetAtTime(target, startTime, timeConstant) {
    this._value = target;
    this.scheduledEvents.push({ type: 'target', target, startTime, timeConstant });
  }
  cancelScheduledValues(time) {
    this.scheduledEvents = this.scheduledEvents.filter(e => e.time < time);
  }
}

class MockAudioNode {
  constructor(context, type) {
    this.context = context;
    this.type = type;
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
    return dest;
  }
  disconnect(dest) {
    if (!dest) {
      this.connections = [];
    } else {
      this.connections = this.connections.filter(d => d !== dest);
    }
  }
}

class MockGainNode extends MockAudioNode {
  constructor(context, initialGain = 1.0) {
    super(context, 'gain');
    this.gain = new MockAudioParam(initialGain);
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  constructor(context) {
    super(context, 'biquad');
    this.type = 'peaking';
    this.frequency = new MockAudioParam(1000);
    this.gain = new MockAudioParam(0);
    this.Q = new MockAudioParam(1.0);
  }
}

class MockAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockAudioNode(this, 'destination');
    this.createdNodes = [];
  }
  createGain() {
    const node = new MockGainNode(this);
    this.createdNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new MockBiquadFilterNode(this);
    this.createdNodes.push(node);
    return node;
  }
  createWaveShaper() {
    const node = new MockAudioNode(this, 'waveshaper');
    node.curve = null;
    node.oversample = 'none';
    this.createdNodes.push(node);
    return node;
  }
  createDelay(maxDelay = 1.0) {
    const node = new MockAudioNode(this, 'delay');
    node.delayTime = new MockAudioParam(0);
    this.createdNodes.push(node);
    return node;
  }
  createConvolver() {
    const node = new MockAudioNode(this, 'convolver');
    node.buffer = null;
    this.createdNodes.push(node);
    return node;
  }
  createAnalyser() {
    const node = new MockAudioNode(this, 'analyser');
    node.fftSize = 128;
    node.smoothingTimeConstant = 0.8;
    this.createdNodes.push(node);
    return node;
  }
  createMediaElementSource(audioEl) {
    const node = new MockAudioNode(this, 'mediaElementSource');
    node.mediaElement = audioEl;
    this.createdNodes.push(node);
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length)
    };
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
}

class MockLocalStorage {
  constructor(initialData = {}) {
    this.store = { ...initialData };
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? String(this.store[key]) : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

class MockDOMElement {
  constructor(tagName = 'div', id = '', classList = []) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new Set(classList);
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.title = '';
  }

  get className() {
    return Array.from(this.classList).join(' ');
  }
  set className(val) {
    this.classList = new Set((val || '').split(/\s+/).filter(Boolean));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    if (this.listeners.has(type)) {
      this.listeners.set(type, this.listeners.get(type).filter(h => h !== handler));
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    if (this.listeners.has(event.type)) {
      for (const handler of this.listeners.get(event.type)) {
        handler.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.id === id) return this;
      for (const child of this.children) {
        if (child.querySelector) {
          const match = child.querySelector(selector);
          if (match) return match;
        }
      }
      return null;
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      if (this.classList.has(cls)) return this;
      for (const child of this.children) {
        if (child.querySelector) {
          const match = child.querySelector(selector);
          if (match) return match;
        }
      }
      return null;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const walk = (node) => {
      if (selector.startsWith('.') && node.classList && node.classList.has(selector.slice(1))) {
        matches.push(node);
      } else if (selector.startsWith('#') && node.id === selector.slice(1)) {
        matches.push(node);
      }
      if (node.children) {
        for (const c of node.children) walk(c);
      }
    };
    walk(this);
    return matches;
  }
}

// Helpers for reading project files
const SPOTIFY_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(SPOTIFY_DIR, '..');

function readProjectFile(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

function projectFileExists(relPath) {
  const fullPath = path.resolve(ROOT_DIR, relPath);
  return fs.existsSync(fullPath);
}

module.exports = {
  assert,
  assertEqual,
  assertDeepEqual,
  assertInRange,
  assertThrows,
  assertRejects,
  createSuite,
  MockAudioContext,
  MockAudioNode,
  MockGainNode,
  MockBiquadFilterNode,
  MockLocalStorage,
  MockDOMElement,
  readProjectFile,
  projectFileExists,
  SPOTIFY_DIR,
  ROOT_DIR
};
