// ================== CONFIG ==================
const lengthDist = {
    1: 0.02998, 2: 0.17651, 3: 0.20511, 4: 0.14787, 5: 0.10700, 6: 0.08388, 7: 0.07939, 8: 0.05943, 9: 0.04437, 10: 0.03076,
    11: 0.01761, 12: 0.00958, 13: 0.00518, 14: 0.00222, 15: 0.00076, 16: 0.00020, 17: 0.00010, 18: 0.00004, 19: 0.00001,
    20: 0.00001, 21: 0, 22: 0, 23: 0
};


// Pass in the outputs from your analyzer (frequencies, not counts).
// singleFreqByPos: { "0": {a:0.12, b:0.05, ...}, "1": {...}, ... }
// bigramFreqByPos: { "0": {aa:0.01, ab:0.03, ...}, "1": {...}, ... }
// lengthDist      : { 1:0.03, 2:0.17, 3:0.20, ... }

import singleFreqByPos from "./onegram_frequency.js";
import bigramFreqByPos from "./bigram_frequency.js"


const AZ = "abcdefghijklmnopqrstuvwxyz".split("");

// ---- helpers ----
function normalize(weights) {
  let s = 0; for (const k in weights) s += weights[k];
  if (s <= 0) {
    const u = 1 / AZ.length;
    const out = {}; for (const l of AZ) out[l] = u;
    return out;
  }
  const out = {};
  for (const k in weights) out[k] = weights[k] / s;
  return out;
}
function weightedChoice(weights, rng = Math.random) {
  const entries = Object.entries(weights);
  let total = entries.reduce((a,[,w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
}
function nearestPos(map, i) {
  // Use exact position if present; else fall back to the largest available <= i; else smallest key
  if (map[i]) return i;
  const keys = Object.keys(map).map(k => +k).sort((a,b)=>a-b);
  if (keys.length === 0) return null;
  let chosen = keys[0];
  for (const k of keys) if (k <= i) chosen = k; else break;
  return chosen;
}

// ---- core generator ----
/**
 * Generate a word using positional unigrams and bigrams with interpolation:
 *   P(letter_i = x | prev, i) = alpha * P_bi(prevx at pos i-1) + (1-alpha) * P_uni(x at pos i)
 */
function createWordGenerator({
  singleFreqByPos,
  bigramFreqByPos,
  lengthDist,
  alpha = 0.85,        // weight for bigram; 0.85–0.95 is usually good
  epsilon = 1e-8,      // tiny additive mass to avoid dead-ends
  requireVowel = true, // enforce at least one vowel per word
  vowels = new Set(["a","e","i","o","u","y"]),
  rng = Math.random,
} = {}) {

  // Pre-normalize length distribution and make sure it’s usable
  const lengthWeights = normalize({ ...lengthDist });

  return function generateWord() {
    const len = +weightedChoice(lengthWeights, rng);

    // pick first letter from positional unigrams at pos 0 (or nearest)
    const pos0 = nearestPos(singleFreqByPos, 0);
    if (pos0 == null) throw new Error("singleFreqByPos is empty.");
    let uni0 = { ...singleFreqByPos[pos0] };
    for (const l of AZ) if (!(l in uni0)) uni0[l] = 0;
    uni0 = normalize(uni0);

    let word = weightedChoice(uni0, rng);
    let hasVowel = vowels.has(word);

    // subsequent letters
    for (let i = 1; i < len; i++) {
      const prev = word[i - 1];

      const uniPos = nearestPos(singleFreqByPos, i);
      const biPos  = nearestPos(bigramFreqByPos, i - 1);

      // Build weights for each candidate letter
      const weights = {};
      for (const l of AZ) {
        const uni = uniPos != null ? (singleFreqByPos[uniPos][l] || 0) : 0;
        const pair = (prev + l);
        const bi  = biPos  != null ? (bigramFreqByPos[biPos][pair] || 0) : 0;

        // Jelinek–Mercer interpolation + tiny epsilon
        weights[l] = alpha * bi + (1 - alpha) * uni + epsilon;
      }

      // If this is the last slot and we still have no vowel, restrict to vowels
      if (requireVowel && i === len - 1 && !hasVowel) {
        let any = false;
        for (const l in weights) {
          if (!vowels.has(l)) weights[l] = 0; else any = true;
        }
        if (!any) {
          // fallback: simple uniform over vowels
          for (const l of AZ) weights[l] = vowels.has(l) ? 1 : 0;
        }
      }

      const choice = weightedChoice(normalize(weights), rng);
      word += choice;
      if (vowels.has(choice)) hasVowel = true;
    }

    // final defensive check (shouldn't trigger)
    if (requireVowel && !hasVowel && word.length > 0) {
      // replace a random position with a vowel using its positional unigram
      const pos = Math.floor(rng() * word.length);
      const uniPos = nearestPos(singleFreqByPos, pos);
      let replWeights = {};
      if (uniPos != null) {
        for (const l of AZ) replWeights[l] = vowels.has(l) ? (singleFreqByPos[uniPos][l] || 0) : 0;
      } else {
        for (const l of AZ) replWeights[l] = vowels.has(l) ? 1 : 0;
      }
      const repl = weightedChoice(normalize(replWeights), rng);
      word = word.slice(0, pos) + repl + word.slice(pos + 1);
    }

    return word;
  };
}

// --------- USAGE EXAMPLE ---------
// import { singleFreq, bigramFreq } from your analyzer step
const gen = createWordGenerator({
  singleFreqByPos: singleFreqByPos,
  bigramFreqByPos: bigramFreqByPos,
  lengthDist: lengthDist
});
for (let i = 0; i < 200; i++) console.log(gen());
