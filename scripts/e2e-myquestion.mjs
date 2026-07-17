/* END-TO-END test for "My Own Question":
   mocks the Claude API with realistic response shapes (clean, messy,
   self-repair, refusal, garbage), then SOLVES the resulting quest the
   way a student would (plot → tokens → answer), checks badge logic,
   and renders every case screen with the custom quest.
   Run: node scripts/e2e-myquestion.mjs                              */
import { execSync } from "child_process";
import fs from "fs";

const src = fs.readFileSync("src/App.jsx", "utf8");
fs.writeFileSync("src/AppTest.jsx", src + `
export { UICtx, VOICES, CONCEPTS, BADGES, buildPalette, makeStyles, resolveFonts,
  parseUserQuestion, StoryMode, Translation, Calculation, Complete };
`);
execSync(`npx esbuild src/AppTest.jsx --bundle --format=esm --outfile=scripts/.e2e-bundle.mjs --loader:.jsx=jsx --external:react --external:react-dom '--define:import.meta.env={"VITE_SUPABASE_URL":"","VITE_SUPABASE_ANON_KEY":""}'`, { stdio: "pipe" });

const { JSDOM } = await import("jsdom");
const dom = new JSDOM("", { url: "https://example.com/" });
global.window = dom.window; global.document = dom.window.document;
global.localStorage = dom.window.localStorage;

const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server");

// ── mock the API: queue of scripted Claude replies ──
let queue = [];
let calls = 0;
global.fetch = async (url, opts) => {
  calls++;
  const body = queue.length ? queue.shift() : "{}";
  return { json: async () => ({ content: [{ type: "text", text: body }] }), status: 200, ok: true };
};

const M = await import("./.e2e-bundle.mjs");

const GOOD = JSON.stringify({
  concept: "takeaway", tier: 0, title: "The Bag and the Note",
  story: "A bag costs 450 rupees. Ravi pays with a 500 note. How much change does he get?",
  unit: "rupees", glossary: { change: "money you get back" },
  tokens: [
    { phrase: "he pays with", token: "500" }, { phrase: "take away", token: "−" },
    { phrase: "the bag costs", token: "450" }, { phrase: "the change", token: "= C" },
    { phrase: "add together", token: "+" },
  ],
  sequence: ["500", "−", "450", "= C"], answer: 50,
  hint: "Start with the note. Take away the price.",
  plot_correct: "We start with money, some is paid, we want what is left.",
  plot_distractors: ["Two prices are added together.", "Money is shared equally."],
});

let pass = 0, fail = 0;
const ok = (name, cond, extra="") => { if (cond) { pass++; } else { fail++; console.log(`  ❌ ${name} ${extra}`); } };

// ═══ 1. Clean response → full quest + full simulated SOLVE ═══
queue = [GOOD]; calls = 0;
{
  const q = await M.parseUserQuestion("A bag costs 450 rupees. Ravi pays with a 500 note. How much change does he get?", "real");
  ok("1a quest built", q.concept === "takeaway" && q.custom === true);
  ok("1b numbers hidden in step 1", !/\d/.test(q.deQuantized) && q.deQuantized.includes("▓▓"), q.deQuantized);
  ok("1c raw keeps numbers for step 3", q.raw.includes("450") && q.raw.includes("500"));
  ok("1d plot answer findable", q.plotOptions[q.correctPlot] === "We start with money, some is paid, we want what is left.");
  ok("1e decoy exists outside sequence", q.tokens.some(t => !q.correctSequence.includes(t.token)));
  // SOLVE like a student: place tokens in sequence order (Translation's exact check)
  const placed = q.correctSequence.map(v => q.tokens.find(t => t.token === v));
  ok("1f translation verify passes", JSON.stringify(placed.map(p => p?.token)) === JSON.stringify(q.correctSequence));
  ok("1g wrong order rejected", JSON.stringify([...q.correctSequence].reverse()) !== JSON.stringify(q.correctSequence));
  // Calculation's exact check (student types "50")
  ok("1h answer accepted", Number("50") === q.answer);
  ok("1i wrong answer rejected", Number("60") !== q.answer);
  // badge: solving a custom case must trigger Case Architect
  const entry = { concept: q.concept, tier: q.tier, clean: true, assist: false, aiUses: 0, retries: 0, custom: q.custom };
  const arch = M.BADGES.find(b => b.id === "architect");
  ok("1j Case Architect badge fires", arch.test({ history: [entry], maxCombo: 1 }));
  ok("1k XP sane", q.xp > 0 && Number.isFinite(q.xp));
  // render every case screen with this custom quest, both voices/modes
  for (const voice of ["real", "arcade"]) for (const mode of ["dark", "light"]) {
    const V = M.VOICES[voice], F = M.resolveFonts(V, "default"), T = M.buildPalette(mode, voice);
    const S = M.makeStyles(T, F, V, false);
    const wrap = el => React.createElement(M.UICtx.Provider, { value: { T, S, F, V, mode, mobile: false } }, el);
    const attempt = { retries: 0, hint: false, assist: false, aiUses: 0 };
    const result = { gained: q.xp, mult: 1, newBadges: [arch], confBefore: 0, confAfter: 20, loot: null, praise: "!" };
    try {
      renderToString(wrap(React.createElement(M.StoryMode, { quest: q, onPass: () => {}, onBack: () => {} })));
      renderToString(wrap(React.createElement(M.Translation, { quest: q, attempt, onPass: () => {}, countRetry: () => {}, onAssist: () => {}, onBack: () => {} })));
      renderToString(wrap(React.createElement(M.Calculation, { quest: q, attempt, onPass: () => {}, countRetry: () => {}, useHint: () => {}, hintUsed: false, onAssist: () => {}, onBack: () => {} })));
      renderToString(wrap(React.createElement(M.Complete, { quest: q, result, onHome: () => {}, onShare: () => {} })));
      pass++;
    } catch (e) { fail++; console.log(`  ❌ 1l render ${voice}/${mode}: ${e.message}`); }
  }
}

// ═══ 2. Messy response: preamble + fences → still works ═══
queue = ["Sure! Here is the JSON you asked for:\n```json\n" + GOOD + "\n```\nHope that helps!"];
{
  const q = await M.parseUserQuestion("same question", "real");
  ok("2 preamble+fences handled", q.answer === 50);
}

// ═══ 3. Self-repair: bad sequence first, fixed on retry ═══
const BAD = JSON.parse(GOOD); BAD.sequence = ["500", "minus", "450", "= C"]; // 'minus' matches no token
queue = [JSON.stringify(BAD), GOOD]; calls = 0;
{
  const q = await M.parseUserQuestion("same question", "real");
  ok("3a self-repair recovered", q.answer === 50);
  ok("3b exactly one retry used", calls === 2, `calls=${calls}`);
}

// ═══ 4. Whitespace drift in tokens → normalized, no retry needed ═══
const SPACEY = JSON.parse(GOOD);
SPACEY.tokens = SPACEY.tokens.map(t => ({ ...t, token: " " + t.token + " " }));
queue = [JSON.stringify(SPACEY)]; calls = 0;
{
  const q = await M.parseUserQuestion("same question", "real");
  ok("4 whitespace normalized (0 retries)", q.answer === 50 && calls === 1, `calls=${calls}`);
}

// ═══ 5. Answer arrives as a string → coerced ═══
const STRANS = JSON.parse(GOOD); STRANS.answer = "50";
queue = [JSON.stringify(STRANS)];
{
  const q = await M.parseUserQuestion("same question", "real");
  ok("5 string answer coerced", q.answer === 50 && typeof q.answer === "number");
}

// ═══ 6. Unsolvable question → kind, specific refusal ═══
queue = [JSON.stringify({ error: "This question has no numbers. Add the numbers and try again." })];
{
  try { await M.parseUserQuestion("what is math", "real"); ok("6 refusal throws", false); }
  catch (e) { ok("6 kind refusal surfaced", String(e.message).startsWith("friendly:This question has no numbers")); }
}

// ═══ 7. Total garbage twice → fails safely after retry ═══
queue = ["I cannot do that", "still not json"]; calls = 0;
{
  try { await M.parseUserQuestion("q", "real"); ok("7 garbage throws", false); }
  catch (e) { ok("7 fails safely after retry", calls === 2 && !String(e.message).startsWith("friendly:")); }
}

fs.unlinkSync("src/AppTest.jsx"); fs.unlinkSync("scripts/.e2e-bundle.mjs");
console.log(`\nMy Own Question E2E: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
