/* Pure selection and grouping logic, shared by the app and its checks. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  function parseEntries(text) { return text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean); }
  function randomInt(max) {
    if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new RangeError('Ungültige Anzahl');
    const limit = Math.floor(0x100000000 / max) * max;
    const value = new Uint32Array(1);
    do { globalThis.crypto.getRandomValues(value); } while (value[0] >= limit);
    return value[0] % max;
  }
  function shuffled(entries, random = randomInt) {
    const copy = [...entries];
    for (let i = copy.length - 1; i > 0; i--) { const j = random(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  }
  function makePairs(entries, random = randomInt) {
    const items = shuffled(entries, random);
    const pairs = [];
    for (let i = 0; i < items.length; i += 2) pairs.push(items.slice(i, i + 2));
    return pairs;
  }
  function makeTeams(entries, count, random = randomInt) {
    const groups = Array.from({ length: Math.min(Math.max(2, Math.floor(count)), entries.length) }, () => []);
    if (!groups.length) return groups;
    shuffled(entries, random).forEach((name, i) => groups[i % groups.length].push(name));
    return groups;
  }
  function mod(n, divisor) { return ((n % divisor) + divisor) % divisor; }
  function targetRotation(current, index, count, turns, landing = 0.5) {
    const target = -(index + landing) * TAU / count;
    return current + turns * TAU + mod(target - current, TAU);
  }
  function indexAtPointer(rotation, count) { return Math.floor(mod(-rotation, TAU) / (TAU / count)) % count; }
  const api = { parseEntries, randomInt, shuffled, makePairs, makeTeams, targetRotation, indexAtPointer, mod, TAU };
  root.WheelCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
