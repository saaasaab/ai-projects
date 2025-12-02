// ---- list.js (example) ----
// export default ["a","aa","aaa","aaron","ab","abandoned","abc","aberdeen","abilities","ability","able"];

// ---- analyze.js ----
import list from "./word_list.js"; // if using CommonJS, use: const list = require("./list.js");
// const list = require("./list.js");

function analyzeDictionary(words, {
    alphabet = "abcdefghijklmnopqrstuvwxyz",
    toLower = true,
  } = {}) {
    const A = new Set(alphabet.split(""));
  
    // initialize nested objects
    const touch = (obj, key, init = () => ({})) => (obj[key] ??= init());
    const inc = (obj, key, by = 1) => (obj[key] = (obj[key] || 0) + by);
  
    // per-position maps
    const singleCounts = {};
    const bigramCounts = {};
  
    for (let raw of words) {
      if (!raw) continue;
      const w = toLower ? raw.toLowerCase() : raw;
      const letters = Array.from(w).filter(ch => A.has(ch));
      if (letters.length === 0) continue;
  
      // --- single-letter counts per position ---
      for (let i = 0; i < letters.length; i++) {
        const ch = letters[i];
        const posMap = touch(singleCounts, i);
        inc(posMap, ch);
      }
  
      // --- bigram counts per starting index ---
      for (let i = 0; i < letters.length - 1; i++) {
        const pair = letters[i] + letters[i + 1];
        const posMap = touch(bigramCounts, i);
        inc(posMap, pair);
      }
    }
  
    // convert counts → frequencies by position (without _total)
    const countsToPercents = (byPosMap) => {
      const out = {};
      for (const [pos, map] of Object.entries(byPosMap)) {
        const total = Object.values(map).reduce((a, b) => a + b, 0);
        const freqMap = {};
        for (const [k, v] of Object.entries(map)) {
          freqMap[k] = v / total;
        }
        out[pos] = freqMap;
      }
      return out;
    };
  
    const singleFreq = countsToPercents(singleCounts);
    const bigramFreq = countsToPercents(bigramCounts);
  
    return { singleCounts, singleFreq, bigramCounts, bigramFreq };
  }
  
  // ---- run & print ----
  const { singleCounts, singleFreq, bigramCounts, bigramFreq } = analyzeDictionary(list);
  
  const pretty = (obj) => JSON.stringify(obj, null, 2);
  
  console.log("== Single-letter counts by position ==");
  console.log(singleCounts);
  
  console.log("== Single-letter frequencies by position ==");
  console.log(singleFreq);
  
  console.log("== Bigram counts by starting position ==");
  console.log(bigramCounts);
  
  console.log("== Bigram frequencies by starting position ==");
  console.log(bigramFreq);