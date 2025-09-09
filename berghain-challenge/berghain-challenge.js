
/***********************
 * 1) Joint sampler (young, well_dressed) — no double counting
 ***********************/
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

function clamp01(x) { return Math.min(1, Math.max(0, x)); }
function normalize(j) {
    const s = j.p00 + j.p01 + j.p10 + j.p11;
    return { p00: j.p00 / s, p01: j.p01 / s, p10: j.p10 / s, p11: j.p11 / s };
}

/***********************
 * 2) Berghain controller (accept/reject policy)
 ***********************/
function runBerghainNight(gameData, N = 1000, rejectCap = 20000, rngSampler) {
    const constraints = gameData.constraints;
    const tracked = Object.fromEntries(constraints.map(c => [c.attribute, 0]));
    const needAttrs = new Set(constraints.map(c => c.attribute));

    const accepted = [];
    let rejections = 0;

    const needOf = a => Math.max(0, constraints.find(c => c.attribute === a).minCount - tracked[a]);

    function deficits() {
        const d = {};
        for (const a of needAttrs) d[a] = needOf(a);
        return d;
    }

    function both(person) {
        // two-fers: satisfy ALL unmet constraints they can (here: both attrs if both are required)
        // For this scenario, it's exactly (young && well_dressed).
        return person.young && person.well_dressed;
    }

    function oneFer(person, def) {
        // true if they help at least one unmet attribute but not all (i.e., exactly one of them)
        const helpsY = def.young > 0 && person.young;
        const helpsW = def.well_dressed > 0 && person.well_dressed;
        return (helpsY ? 1 : 0) + (helpsW ? 1 : 0) === 1;
    }

    function zeroFer(person, def) {
        const helpsY = def.young > 0 && person.young;
        const helpsW = def.well_dressed > 0 && person.well_dressed;
        return !(helpsY || helpsW);
    }

    while (accepted.length < N && rejections < rejectCap) {
        const person = rngSampler();
        const def = deficits();
        const yNeed = def.young || 0;
        const wNeed = def.well_dressed || 0;
        const R = N - accepted.length;

        const minBothNeeded = Math.max(0, yNeed + wNeed - R);

        if (yNeed === 0 && wNeed === 0) {
            // All minimums met — fill up with anyone
            accepted.push(person);
            for (const a of needAttrs) if (person[a]) tracked[a]++;
            continue;
        }

        if (both(person)) {
            // Always take two-fers
            accepted.push(person);
            if (person.young) tracked.young++;
            if (person.well_dressed) tracked.well_dressed++;
            continue;
        }

        if (minBothNeeded > 0) {
            // We MUST save slots for overlap — reject non-two-fers
            rejections++;
            continue;
        }

        // minBothNeeded == 0 → we can take helpful one-fers freely
        if (oneFer(person, def)) {
            accepted.push(person);
            if (person.young) tracked.young++;
            if (person.well_dressed) tracked.well_dressed++;
            continue;
        }

        // Zero-fer: only accept if we still have enough slots to cover the remaining one-fer deficits
        if (R - 1 >= (yNeed + wNeed)) {
            accepted.push(person);
            // zero-fer by definition doesn’t increment tracked
        } else {
            rejections++;
        }
    }

    const finalDef = deficits();
    const success = accepted.length === N && finalDef.young === 0 && finalDef.well_dressed === 0;

    return {
        success,
        acceptedCount: accepted.length,
        rejections,
        finalCounts: { ...tracked },
        unmetDeficits: finalDef,
        filled: accepted.length
    };
}



// /decide-and-next?gameId=uuid&personIndex=0

// /decide-and-next?gameId=8b7c55ed-0bb9-4c19-a985-9f5bbf4fec0a&personIndex=0

/***********************
 * 3) Wire it together with your exact gameData
 ***********************/
const gameData = {
    "gameId": "8b7c55ed-0bb9-4c19-a985-9f5bbf4fec0a",
    "constraints": [
        { "attribute": "young", "minCount": 600 },
        { "attribute": "well_dressed", "minCount": 600 }
    ],
    "attributeStatistics": {
        "relativeFrequencies": {
            "well_dressed": 0.3225,
            "young": 0.3225
        },
        "correlations": {
            "well_dressed": { "well_dressed": 1, "young": 0.18304299322062992 },
            "young": { "well_dressed": 0.18304299322062992, "young": 1 }
        }
    }
};



// Build a sampler for arrivals
const { joint, sampleOne } = makeSampler(gameData);
console.log("Joint distribution:", joint);

// Run a night
const result = runBerghainNight(gameData, 1000, 20000, sampleOne);
console.log("Result:", result);

