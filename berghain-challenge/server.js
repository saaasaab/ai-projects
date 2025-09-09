/***********************
 * 1) Joint sampler (young, well_dressed) — no double counting
 ***********************/


function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function normalize(j) {
    const s = j.p00 + j.p01 + j.p10 + j.p11;
    return { p00: j.p00 / s, p01: j.p01 / s, p10: j.p10 / s, p11: j.p11 / s };
}

function makeSampler(gameData) {
    const freqs = gameData.attributeStatistics.relativeFrequencies;
    const corr = gameData.attributeStatistics.correlations;

    const A = "young";
    const B = "well_dressed";

    const pX = freqs[A];
    const pY = freqs[B];
    const r = corr[A][B];

    // p11 from Pearson correlation for Bernoulli variables
    const sx = Math.sqrt(pX * (1 - pX));
    const sy = Math.sqrt(pY * (1 - pY));
    const p11 = r * (sx * sy) + pX * pY;

    // Feasibility bounds for p11
    const p11Min = Math.max(0, pX + pY - 1);
    const p11Max = Math.min(pX, pY);
    if (p11 < p11Min - 1e-12 || p11 > p11Max + 1e-12) {
        throw new Error(`Infeasible inputs: implied p11=${p11.toFixed(6)} not in [${p11Min.toFixed(6)}, ${p11Max.toFixed(6)}].`);
    }

    const p10 = pX - p11;               // young & !well_dressed
    const p01 = pY - p11;               // !young & well_dressed
    const p00 = 1 - (p11 + p10 + p01);  // neither

    const joint = normalize({
        p00: clamp01(p00),
        p01: clamp01(p01),
        p10: clamp01(p10),
        p11: clamp01(p11),
    });

    const t00 = joint.p00;
    const t01 = t00 + joint.p01;
    const t10 = t01 + joint.p10;
    // t11 is the remainder to 1

    function sampleOne() {
        const u = Math.random();
        if (u < t00) return { young: false, well_dressed: false };
        if (u < t01) return { young: false, well_dressed: true };
        if (u < t10) return { young: true, well_dressed: false };
        return { young: true, well_dressed: true };
    }

    return { joint, sampleOne };
}


/***********************
 * 1) API Helper Functions
 ***********************/
async function makeApiRequest(gameId, personIndex, accept) {
    // fetch request to get next person
    // console.log(personIndex, accept, `https://berghain.challenges.listenlabs.ai/decide-and-next?gameId=${gameId}&personIndex=${personIndex}&accept=${accept}`)
    if (personIndex === 0) {
        const response = await fetch(`https://berghain.challenges.listenlabs.ai/decide-and-next?gameId=${gameId}&personIndex=${personIndex}`);
        return response.json();
    }
    else {
        const response = await fetch(`https://berghain.challenges.listenlabs.ai/decide-and-next?gameId=${gameId}&personIndex=${personIndex}&accept=${accept}`);
        return response.json();
    }
}


// ---------- Math helpers (works on all Node versions) ----------
function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const ax = Math.abs(x), t = 1 / (1 + p * ax);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
    return sign * y;
}
function stdNormalCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

function binomTailGE(k, n, p) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    const mu = n * p, v = n * p * (1 - p);
    if (v === 0) return (k <= mu) ? 1 : 0;
    const sd = Math.sqrt(v);
    const z = (k - 0.5 - mu) / sd;          // continuity correction
    return 1 - stdNormalCdf(z);
}

// Joint p(i∧j) from marginals & Pearson r for Bernoulli vars; clamped to Fréchet bounds.
function jointPijFromCorr(pi, pj, rij) {
    const raw = rij * Math.sqrt(pi * (1 - pi) * pj * (1 - pj)) + pi * pj;
    const lo = Math.max(0, pi + pj - 1), hi = Math.min(pi, pj);
    return Math.min(hi, Math.max(lo, raw));
}

// Max-weight matching over a tiny set (n ≤ 6 here). Unmatched nodes allowed.
function maxWeightMatching(weights) {
    const n = weights.length, used = Array(n).fill(false);
    let bestSum = 0, bestPairs = [];
    function dfs(i, sum, pairs) {
        while (i < n && used[i]) i++;
        if (i >= n) { if (sum > bestSum) { bestSum = sum; bestPairs = pairs.slice(); } return; }
        // leave i unmatched
        used[i] = true; dfs(i + 1, sum, pairs); used[i] = false;
        // match i with j
        used[i] = true;
        for (let j = i + 1; j < n; j++) if (!used[j]) {
            used[j] = true; pairs.push([i, j]);
            dfs(i + 1, sum + weights[i][j], pairs);
            pairs.pop(); used[j] = false;
        }
        used[i] = false;
    }
    dfs(0, 0, []);
    return { sum: bestSum, pairs: bestPairs };
}

// Conservative combine: Bonferroni lower bound for intersection of events
function combineLowerBound(ps) {
    const s = ps.reduce((a, b) => a + b, 0);
    return Math.max(0, s - (ps.length - 1));
}

/**
 * Strict expected-value decider for many attributes.
 *
 * personAttrs: { [attr]: boolean }          // current person's attributes
 * state: {
 *   acceptedCount: number,
 *   counts: { [attr]: number },             // accepted so far per attribute
 *   N: number,
 *   minByAttr: { [attr]: number }           // required mins
 * }
 * stats: {
 *   relativeFrequencies: { [attr]: number },        // p_i
 *   correlations: { [a]: { [b]: r_ab } }            // Pearson r between Bernoulli attrs
 * }
 * opts: {
 *   riskSingles?: number,     // default 0.01  (99% confidence for each single-attr tail)
 *   riskPairsTotal?: number   // total pairwise risk budget, default 0.02 (Bonferroni over pairs)
 * }
 *
 * return: true = ACCEPT, false = REJECT
 */
function decidePersonEV(personAttrs, state, stats, opts = {}) {
    const riskSingles = opts.riskSingles ?? 0.01;
    const riskPairsTotal = opts.riskPairsTotal ?? 0.02;

    const attrs = Object.keys(state.minByAttr);
    const m = attrs.length;

    // Remaining slots (including this one)
    const R = state.N - state.acceptedCount;

    // Current needs
    const have = attrs.map(a => state.counts[a] || 0);
    const mins = attrs.map(a => state.minByAttr[a] || 0);
    const needNow = mins.map((t, i) => Math.max(0, t - have[i]));
    if (needNow.every(d => d === 0)) return true;  // quotas already met

    const has = attrs.map(a => !!personAttrs[a]);
    const p_i = attrs.map(a => stats.relativeFrequencies[a]);

    function scenarioEval(acceptThis) {
        const RH = R - (acceptThis ? 1 : 0);
        const needH = needNow.slice();
        if (acceptThis) for (let i = 0; i < m; i++) if (has[i]) needH[i] = Math.max(0, needH[i] - 1);

        // --- Singles gating: identify critical attrs (tail below 1 - riskSingles) ---
        const singleTail = needH.map((need, i) => binomTailGE(need, RH, p_i[i]));
        const critical = singleTail.map(t => t < (1 - riskSingles));
        const criticalExists = critical.some(Boolean);
        const helpsCritical = critical.some((c, i) => c && has[i]);

        // --- Pairwise overlap gating: if sum needs exceeds slots, need multi-cover ---
        const sumNeed = needH.reduce((a, b) => a + b, 0);
        const S = Math.max(0, sumNeed - RH);  // extra units needed from overlaps
        let pairsOK = true;

        if (S > 0) {
            // Build pairwise joints for unmet attrs only
            const unmet = []; for (let i = 0; i < m; i++) if (needH[i] > 0) unmet.push(i);
            if (unmet.length < 2) {
                pairsOK = false; // need overlap but only 1 unmet attr left -> impossible
            } else {
                // Per-pair required minimum overlaps
                const pairCount = (unmet.length * (unmet.length - 1)) / 2;
                const perPairAlpha = riskPairsTotal / Math.max(1, pairCount); // Bonferroni split

                // Check each pair (i,j) requires S_ij two-fers at minimum
                for (let u = 0; u < unmet.length; u++) {
                    for (let v = u + 1; v < unmet.length; v++) {
                        const i = unmet[u], j = unmet[v];
                        const Sij = Math.max(0, needH[i] + needH[j] - RH);
                        if (Sij === 0) continue;
                        const rij = stats.correlations[attrs[i]][attrs[j]];
                        const pij = jointPijFromCorr(p_i[i], p_i[j], rij);
                        const tail = binomTailGE(Sij, RH, pij);
                        if (tail < 1 - perPairAlpha) { pairsOK = false; break; }
                    }
                    if (!pairsOK) break;
                }

                // Optional: also estimate pooled two-fer supply via max-weight matching
                if (pairsOK) {
                    const nU = unmet.length;
                    const W = Array.from({ length: nU }, () => Array(nU).fill(0));
                    for (let a = 0; a < nU; a++) for (let b = a + 1; b < nU; b++) {
                        const i = unmet[a], j = unmet[b];
                        const rij = stats.correlations[attrs[i]][attrs[j]];
                        const pij = jointPijFromCorr(p_i[i], p_i[j], rij);
                        W[a][b] = W[b][a] = pij;
                    }
                    const { sum, pairs } = maxWeightMatching(W);
                    if (pairs.length === 0) pairsOK = false;
                    else {
                        const p2 = sum / pairs.length;
                        const tail2 = binomTailGE(S, RH, p2);
                        if (tail2 < 1 - riskSingles) pairsOK = false; // reuse singles alpha as confidence
                    }
                }
            }
        }

        // Conservative overall lower bound combining singles
        const overallLB = combineLowerBound(singleTail);
        return { criticalExists, helpsCritical, pairsOK, overallLB };
    }

    const A = scenarioEval(true);
    const B = scenarioEval(false);

    // Hard decisions first
    if (!A.pairsOK && B.pairsOK) return false;    // accepting breaks overlap feasibility
    if (A.pairsOK && !B.pairsOK) return true;     // rejecting breaks it but accepting keeps it

    // Scarcity gate: if critical attrs exist, only accept if the person helps ≥1 critical
    if (A.criticalExists && !A.helpsCritical) return false;

    // Otherwise, choose higher conservative success bound
    if (A.overallLB > B.overallLB) return true;
    if (A.overallLB < B.overallLB) return false;

    // Tie-breaker: accept if they help any unmet attr; else reject to save the slot
    const helpsAny = needNow.some((need, i) => need > 0 && has[i]);
    return helpsAny;
}

const gameData = {
    "gameId": "f03ab59b-d242-45d2-8a13-bf3be7f5dd8a",
    "constraints": [
        {
            "attribute": "underground_veteran",
            "minCount": 500
        },
        {
            "attribute": "international",
            "minCount": 650
        },
        {
            "attribute": "fashion_forward",
            "minCount": 550
        },
        {
            "attribute": "queer_friendly",
            "minCount": 250
        },
        {
            "attribute": "vinyl_collector",
            "minCount": 200
        },
        {
            "attribute": "german_speaker",
            "minCount": 800
        }
    ],
    "attributeStatistics": {
        "relativeFrequencies": {
            "underground_veteran": 0.6794999999999999,
            "international": 0.5735,
            "fashion_forward": 0.6910000000000002,
            "queer_friendly": 0.04614,
            "vinyl_collector": 0.044539999999999996,
            "german_speaker": 0.4565000000000001
        },
        "correlations": {
            "underground_veteran": {
                "underground_veteran": 1,
                "international": -0.08110175777152992,
                "fashion_forward": -0.1696563475505309,
                "queer_friendly": 0.03719928376753885,
                "vinyl_collector": 0.07223521156389842,
                "german_speaker": 0.11188766703422799
            },
            "international": {
                "underground_veteran": -0.08110175777152992,
                "international": 1,
                "fashion_forward": 0.375711059360155,
                "queer_friendly": 0.0036693314388711686,
                "vinyl_collector": -0.03083247098181075,
                "german_speaker": -0.7172529382519395
            },
            "fashion_forward": {
                "underground_veteran": -0.1696563475505309,
                "international": 0.375711059360155,
                "fashion_forward": 1,
                "queer_friendly": -0.0034530926793377476,
                "vinyl_collector": -0.11024719606358546,
                "german_speaker": -0.3521024461597403
            },
            "queer_friendly": {
                "underground_veteran": 0.03719928376753885,
                "international": 0.0036693314388711686,
                "fashion_forward": -0.0034530926793377476,
                "queer_friendly": 1,
                "vinyl_collector": 0.47990640803167306,
                "german_speaker": 0.04797381132680503
            },
            "vinyl_collector": {
                "underground_veteran": 0.07223521156389842,
                "international": -0.03083247098181075,
                "fashion_forward": -0.11024719606358546,
                "queer_friendly": 0.47990640803167306,
                "vinyl_collector": 1,
                "german_speaker": 0.09984452286269897
            },
            "german_speaker": {
                "underground_veteran": 0.11188766703422799,
                "international": -0.7172529382519395,
                "fashion_forward": -0.3521024461597403,
                "queer_friendly": 0.04797381132680503,
                "vinyl_collector": 0.09984452286269897,
                "german_speaker": 1
            }
        }
    }
}

// Build state once at start:
const state = {
    acceptedCount: 603,
    rejectedCount: 22,
    counts: {
        underground_veteran: 392,
        international: 379,
        fashion_forward: 412,
        queer_friendly: 31,
        vinyl_collector: 29,
        german_speaker: 278
      },      
    N: 1000,
    minByAttr: {
        underground_veteran: 500,
        international: 650,
        fashion_forward: 550,
        queer_friendly: 250,
        vinyl_collector: 200,
        german_speaker: 800
    }
};

// Stats from your payload:
const stats = {
    relativeFrequencies: {
        underground_veteran: 0.6795,
        international: 0.5735,
        fashion_forward: 0.691,
        queer_friendly: 0.04614,
        vinyl_collector: 0.04454,
        german_speaker: 0.4565
    },
    correlations: {
        underground_veteran: { international: -0.08110175777152992, fashion_forward: -0.1696563475505309, queer_friendly: 0.03719928376753885, vinyl_collector: 0.07223521156389842, german_speaker: 0.11188766703422799, underground_veteran: 1 },
        international: { underground_veteran: -0.08110175777152992, fashion_forward: 0.375711059360155, queer_friendly: 0.0036693314388711686, vinyl_collector: -0.03083247098181075, german_speaker: -0.7172529382519395, international: 1 },
        fashion_forward: { underground_veteran: -0.1696563475505309, international: 0.375711059360155, queer_friendly: -0.0034530926793377476, vinyl_collector: -0.11024719606358546, german_speaker: -0.3521024461597403, fashion_forward: 1 },
        queer_friendly: { underground_veteran: 0.03719928376753885, international: 0.0036693314388711686, fashion_forward: -0.0034530926793377476, vinyl_collector: 0.47990640803167306, german_speaker: 0.04797381132680503, queer_friendly: 1 },
        vinyl_collector: { underground_veteran: 0.07223521156389842, international: -0.03083247098181075, fashion_forward: -0.11024719606358546, queer_friendly: 0.47990640803167306, german_speaker: 0.09984452286269897, vinyl_collector: 1 },
        german_speaker: { underground_veteran: 0.11188766703422799, international: -0.7172529382519395, fashion_forward: -0.3521024461597403, queer_friendly: 0.04797381132680503, vinyl_collector: 0.09984452286269897, german_speaker: 1 }
    }
};





let response = null
try {
    let acceptPerson = true;
    for (let i = 1; i < 20000; i++) {

        // console.log("index: ",i)
        response = await makeApiRequest(gameData.gameId, i, acceptPerson);

        const { status, admittedCount, rejectedCount, nextPerson } = response;

        // acceptPerson = decideExpectedMulti( nextPerson, state, stats, { risk: 0.05 });

        acceptPerson = decidePersonEV(nextPerson.attributes, state, stats, {
            riskSingles: 0.01,     // 99% confidence per attribute
            riskPairsTotal: 0.02   // split across all active pairs
        });

        if (acceptPerson) {
            state.acceptedCount += 1;
            for (const k in nextPerson.attributes) if (nextPerson.attributes[k]) state.counts[k] += 1;
        } else {
            // increment rejectedCount in your orchestration if you track it locally
            state.rejectedCount += 1;
        }

        // console.log(acceptPerson);
        // break;

        // After you send the decision to the server, update your local state accordingly

        // console.log(response);
        // break;

        // console.log("Accepting person: ", acceptPerson, status);
        // console.log("Accepting person: ", acceptPerson,status, nextPerson, response, state);
        // break;

        if (i % 20 === 0) {
            console.log(i, admittedCount, rejectedCount, state.counts);
        }

        // if (acceptPerson) {
        //     state.acceptedCount++;
        //     state.counts.young += (nextPerson.attributes.young ? 1 : 0);
        //     state.counts.well_dressed += (nextPerson.attributes.well_dressed ? 1 : 0);
        // } else {
        //     state.rejectedCount++;
        // }

        if (state.acceptedCount === 1001 || state.rejectedCount + state.acceptedCount === 20000) {
            break;
        }
    }
} catch (e) {
    console.log(response);
    console.log(e);
}

// console.log(state);

