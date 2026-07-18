import React, { useState, useMemo, useEffect, useRef, useContext, createContext } from "react";
/* recharts is heavy (~400KB) and only the Journey chart needs it —
   loaded on demand so the main bundle stays small (React best practice) */
function useRecharts() {
  const [mod, setMod] = useState(null);
  useEffect(() => { let ok = true; import("recharts").then((m) => ok && setMod(m)); return () => { ok = false; }; }, []);
  return mod;
}
import { createClient } from "@supabase/supabase-js";
import {
  Sun, Moon, Flame, Sparkles, Trophy, Award, Zap, Radio, Lock, Check, Send, Bot, Wand2, Eye,
  Gem, Swords, TrendingUp, FolderOpen, Hammer, Lightbulb, Battery, Shield, Star, ChevronRight, Loader2, Palette, BookOpen,
  Map, Share2, Crown, Gamepad2, HelpCircle, ArrowLeft, Copy,
} from "lucide-react";

/* ═════════════════════════════════════════════════════════════
   PROJECT DECODE — v5 "Baker Street Update"
   • WORD THEMES (voice packs): Baker Street (Sherlock), Real
     Life, Cyber Grid — each swaps vocabulary, story skins,
     QUOTES, FONTS and color accents. Chosen at check-in,
     switchable anytime.
   • AI PUSHBACK: the sidekick answers 2 questions per case,
     then locks until the student makes a real attempt —
     "attempt before assistance." Heavy AI use also counts
     like a hint in the confidence engine.
   • VISUAL MATH: every generated problem can render a bar
     model / staircase diagram (Singapore-method style).
   • Realistic problem skins, warmer motivating copy, step
     progress indicator, quick-reply chips, richer typography.
   ═════════════════════════════════════════════════════════════ */


/* ── optional Google login via Supabase ─────────────────────────
   Works automatically once VITE_SUPABASE_URL and
   VITE_SUPABASE_ANON_KEY are set (see README). Without them the
   app quietly falls back to on-device profiles. */
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;

/* ── saved progress (this device) ───────────────────────────── */
const SAVE_KEY = "decode-save-v1";
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; }
}

/* ── Claude API ─────────────────────────────────────────────── */
async function askClaude(system, messages, maxTokens = 700) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  });
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
const stripFences = (s) => s.replace(/```json|```/g, "").trim();

/* robust JSON extraction: Claude sometimes adds preamble or fences
   even when told not to — never let formatting kill the feature */
function extractJSON(text) {
  const t = stripFences(String(text || ""));
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("no json");
  return JSON.parse(t.slice(a, b + 1));
}
const normTok = (x) => String(x).trim();

/* validate + normalize a quest-shaped payload from the model.
   Returns {ok:true,q} or {ok:false,reason} so callers can self-repair. */
function validateQuestPayload(q) {
  if (q.error) return { ok: false, friendly: String(q.error) };
  if (!CONCEPTS[q.concept]) return { ok: false, reason: `"concept" must be one of: ${Object.keys(CONCEPTS).join(", ")}` };
  if (!Array.isArray(q.tokens) || q.tokens.length < 4) return { ok: false, reason: '"tokens" must be an array of 4-5 {phrase,token} objects' };
  q.tokens = q.tokens.map((t) => ({ ...t, token: normTok(t.token), phrase: String(t.phrase || t.token) }));
  if (!Array.isArray(q.sequence) || q.sequence.length < 3) return { ok: false, reason: '"sequence" must list 3-4 token values in equation order' };
  q.sequence = q.sequence.map(normTok);
  const vals = q.tokens.map((t) => t.token);
  const missing = q.sequence.filter((x) => !vals.includes(x));
  if (missing.length) return { ok: false, reason: `every "sequence" item must EXACTLY match a token's "token" value; these do not: ${JSON.stringify(missing)}` };
  const ans = Number(q.answer);
  if (!Number.isFinite(ans)) return { ok: false, reason: '"answer" must be a plain number' };
  q.answer = ans;
  if (!q.plot_correct || !Array.isArray(q.plot_distractors) || q.plot_distractors.length < 2)
    return { ok: false, reason: 'need "plot_correct" and 2 "plot_distractors"' };
  return { ok: true, q };
}

/* ask → validate → if invalid, tell the model exactly why and retry once */
async function askForQuestJSON(system, prompt, maxTokens = 900) {
  let messages = [{ role: "user", content: prompt }];
  let lastReason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await askClaude(system, messages, maxTokens);
    if (!out || !out.trim()) throw new Error("friendly:The helper did not answer. Please try again.");
    let parsed;
    try { parsed = extractJSON(out); }
    catch { lastReason = "the reply was not valid JSON"; messages = [...messages, { role: "assistant", content: out }, { role: "user", content: "That was not valid JSON. Send ONLY the corrected raw JSON object, nothing else." }]; continue; }
    const v = validateQuestPayload(parsed);
    if (v.ok) return v.q;
    if (v.friendly) throw new Error("friendly:" + v.friendly);
    lastReason = v.reason;
    messages = [...messages, { role: "assistant", content: out }, { role: "user", content: `That JSON was invalid: ${v.reason}. Send ONLY the corrected raw JSON object, nothing else.` }];
  }
  throw new Error("invalid after retry: " + lastReason);
}



/* base64 helpers — modern, emoji-safe (no deprecated escape/unescape) */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ── RNG ────────────────────────────────────────────────────── */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/* ═══ VOICE PACKS ═══════════════════════════════════════════── */
const VOICES = {
  real: {
    id: "real", name: "Real Life", emoji: "🌍", tagline: "Your actual world: money, battery, friends",
    sidekick: { name: "Coach Sam", persona: "You are Coach Sam, a friendly older-brother/sister type coach. IMPORTANT: use very simple English — short sentences, common everyday words a 14-year-old English learner knows." },
    appName: "DECODE",
    steps: ["Read it", "Set it up", "Work it out"],
    ui: {
      checkinEyebrow: "quick check-in", checkinTitle: "How is your energy right now?",
      checkinSub: "Low-energy days are normal. We will give you the right problems for today.",
      boardEyebrow: "today's problems · new numbers every time", boardTitle: "What do you want to work out?",
      dailyLabel: "Today's real-life puzzle", start: "Let's go",
      storyEyebrow: "step 1 of 3 · read it — numbers hidden", storyPrompt: "Forget the math for now. What is happening here?",
      confirmPlot: "Yes, this is it", transEyebrow: "step 2 of 3 · set it up",
      transTitle: "Turn the words into math", verify: "Check my setup",
      calcEyebrow: "step 3 of 3 · work it out", calcTitle: "Work it out.",
      fire: "Lock it in", visualBtn: "Show me a picture",
      doneTitle: "YOU GOT IT.", bossTitle: "BIG ONE. DONE.",
      plotMiss: "Close — read it one more time. What is happening to the amount?",
      seqMiss: "The setup is a little off — that's normal. Take a piece out and think where it goes.",
      calcMiss: "Not yet — and that's okay. That is how solving works. Change your number and try again.",
      byteLock: "I gave you two tips already. Try one time by yourself — then I'm right here again.",
      praise: ["You just learned a real-life skill.", "Many adults cannot do that. You can.", "See? Your brain CAN do this.", "This skill is yours now. Forever."],
    },
    quotes: [
      "You use this same math every time you buy something.",
      "A wrong answer is a first try, not a fail.",
      "You are not bad at math. You are new at math.",
      "Slow and steady really does win.",
      "Every problem you solve here helps you in real life.",
      "Nobody is grading you. You are just getting stronger.",
      "One real try is worth more than ten excuses.",
    ],
    forgeIdeas: ["saving for shoes", "cricket scores", "my phone plan", "sharing food with friends", "gym progress"],
  },
  arcade: {
    id: "arcade", name: "Retro Arcade", emoji: "🕹️", tagline: "Pixels, tokens and high scores",
    sidekick: { name: "Pix", persona: "You are Pix, a tiny happy pixel sprite from an arcade game. Fun and playful, never babyish. IMPORTANT: use very simple English — short sentences, common words a 14-year-old English learner knows." },
    appName: "DECODE ▸",
    steps: ["Read the level", "Build the combo", "Hit the score"],
    ui: {
      checkinEyebrow: "player check-in", checkinTitle: "How full is your power bar today?",
      checkinSub: "No wrong answer — this picks the right levels for today.",
      boardEyebrow: "level select · new numbers every play", boardTitle: "Choose your level, Player One.",
      dailyLabel: "Daily challenge stage", start: "Press start",
      storyEyebrow: "stage 1 of 3 · read the level — numbers hidden", storyPrompt: "No math yet. Just read. What is happening in this level?",
      confirmPlot: "That's the level", transEyebrow: "stage 2 of 3 · the combo builder",
      transTitle: "Turn the words into math", verify: "Test the combo",
      calcEyebrow: "stage 3 of 3 · go for the score", calcTitle: "Hit the answer.",
      fire: "GO!", visualBtn: "Show me a picture",
      doneTitle: "STAGE CLEAR!", bossTitle: "BOSS DEFEATED!",
      plotMiss: "Close! Read the level one more time — what is happening to the number?",
      seqMiss: "Combo broken — but no life lost. Take a block out and try a new order.",
      calcMiss: "Missed the score — but you never lose lives here. Change your number and press GO again.",
      byteLock: "I gave you two power-ups already. Play one turn by yourself — then I recharge.",
      praise: ["STAGE CLEAR — all you.", "That was high-score energy.", "Your combo skills are growing.", "Player One is leveling up for real."],
    },
    quotes: [
      "Every pro gamer was once stuck on level 1.",
      "A miss is not game over. You have infinite lives here.",
      "Practice mode today. Boss mode tomorrow.",
      "'One more try' is the oldest cheat code.",
      "Your brain levels up on the hard stages.",
      "Small wins fill the power bar.",
      "Math is a game. You are learning the controls.",
    ],
    forgeIdeas: ["space shooter", "kart racing", "pixel pets", "tower defense", "arcade prizes"],
  },
};

/* ── concepts ───────────────────────────────────────────────── */
const TIER_NAMES = ["Easy", "Medium", "Hard", "Adv"];
const TIER_WEIGHT = [0.6, 1.0, 1.4, 1.9]; // confidence contribution
const TIER_XP = [1, 1.4, 1.9, 2.6];       // XP scaling
const TIER_UNLOCK = [0, 20, 45, 70];      // confidence % needed
const unlockedTier = (conf) => TIER_UNLOCK.reduce((m, u, i) => (conf >= u ? i : m), 0);


/* colorful icon per math concept — used on cards, bank, tests, journey */
const CONCEPT_ICONS = {
  takeaway: "🧮", ratedrain: "🔋", ratebuild: "💰", fairsplit: "🍕",
  percent: "🏷️", average: "📊", speed: "🚌", arearect: "📐",
  simpleinterest: "🏦", pythagoras: "📏",
};

const CONCEPTS = {
  takeaway: {
    label: "Start & Take Away", short: "A − B", baseXp: 60, formula: "left = start − taken",
    fieldNote: { headline: "This is the math of 'how much is left?'", examples: ["Money left after you buy something", "Break time left", "Free space left on your phone"] },
    plots: { correct: "We start with an amount. Some of it goes away. We want what is left.", distractors: ["Two amounts are added to make a bigger total.", "The amount becomes double, again and again."] },
    hint: "Words like 'lost', 'spent', 'took' mean MINUS (−). Start with the full amount. Take away what is gone.",
  },
  ratedrain: {
    label: "Going Down Step by Step", short: "S − r·t = E", baseXp: 90, formula: "steps = (start − end) ÷ drop",
    fieldNote: { headline: "This is exactly how your phone battery works.", examples: ["When will my battery reach 10%?", "How many weeks will my money last?", "When will the fuel tank be empty?"] },
    plots: { correct: "The amount goes DOWN by the same step, again and again. We want: how many steps?", distractors: ["The amount goes UP by the same step every hour.", "One total is shared equally between people."] },
    hint: "'Every hour' means the drop repeats. The same drop happens again and again. Count: how many drops from start to end?",
  },
  ratebuild: {
    label: "Start Amount + Same Step Added", short: "b + r·x = T", baseXp: 120, formula: "x = (total − start) ÷ step",
    fieldNote: { headline: "Every phone plan and taxi ride uses this exact math.", examples: ["Taxi: start price + price for each km", "Phone plan: base price + price for each extra GB", "Saving: money now + money added each week"] },
    plots: { correct: "We start with a fixed amount. The same small amount is added again and again, until it reaches the total.", distractors: ["One total is shared equally into groups.", "The money grows by interest every minute."] },
    hint: "'Each' or 'per' means MULTIPLY (×). First take the start amount away from the total. Then see how many small steps fill the rest.",
  },
  fairsplit: {
    label: "Fair Share", short: "T ÷ n", baseXp: 80, formula: "each = total ÷ how many",
    fieldNote: { headline: "The math of sharing fairly — so nobody cheats you.", examples: ["Sharing a food bill with friends", "Sharing game coins in a team", "Sharing practice time fairly"] },
    plots: { correct: "One total is shared equally. We want: how much does each one get?", distractors: ["Amounts are added together to make a total.", "The amount goes down step by step."] },
    hint: "'Equally', 'each', 'share' means DIVIDE (÷). Take the total and divide by how many are sharing.",
  },
  percent: {
    label: "Percent Of", short: "P% of N", baseXp: 100, formula: "part = (P × N) ÷ 100",
    fieldNote: { headline: "Shops, marks and batteries all use percent.", examples: ["A 20% discount in a shop", "Your test score out of 100", "Battery percent on your phone"] },
    plots: { correct: "We take a percent (a part out of every 100) of one amount.", distractors: ["Two amounts are added together.", "One total is shared equally between people."] },
    hint: "P% means P out of every 100. Multiply the amount by P, then divide by 100.",
  },
  average: {
    label: "Average (Mean)", short: "total ÷ count", baseXp: 100, formula: "average = total ÷ how many",
    fieldNote: { headline: "The average tells you the 'normal' value.", examples: ["Your average test score", "Average runs per match in cricket", "Average hours you sleep"] },
    plots: { correct: "We add the numbers, then divide by how many numbers there are.", distractors: ["We pick the biggest number only.", "The amount goes down step by step."] },
    hint: "First ADD all the numbers to get the total. Then DIVIDE by how many numbers you added.",
  },
  speed: {
    label: "Speed · Distance · Time", short: "d = s × t", baseXp: 110, formula: "time = distance ÷ speed",
    fieldNote: { headline: "Every bus, train and bike trip uses this.", examples: ["How long will the bus take?", "How fast was the train going?", "How far can you go in 2 hours?"] },
    plots: { correct: "Something moves at the same speed. We want: how long does the trip take?", distractors: ["One total is shared equally.", "An amount is taken away one time."] },
    hint: "Distance = speed × time. So to find the time: divide the distance by the speed.",
  },
  arearect: {
    label: "Area of a Rectangle", short: "A = l × w", baseXp: 100, formula: "area = length × width",
    fieldNote: { headline: "Area = how much flat space something covers.", examples: ["Floor space of your room", "Size of a phone screen", "A carrom board or cricket pitch"] },
    plots: { correct: "We want the flat space INSIDE a rectangle: length times width.", distractors: ["We want the distance AROUND the outside.", "We share the space equally between people."] },
    hint: "Area means the space INSIDE the shape. Multiply length × width.",
  },
  simpleinterest: {
    label: "Simple Interest", short: "SI = P·R·T ÷ 100", baseXp: 130, formula: "SI = (P × R × T) ÷ 100",
    fieldNote: { headline: "Banks use this exact formula for savings and loans.", examples: ["Extra money the bank gives on savings", "The cost of borrowing money", "Why saving early is smart"] },
    plots: { correct: "Money grows by a fixed percent every year. We want the extra money (the interest).", distractors: ["The money is shared equally.", "The money is spent step by step."] },
    hint: "Multiply P (the money) × R (the percent) × T (the years). Then divide by 100.",
  },
  pythagoras: {
    label: "Pythagoras (Right Triangle)", short: "c² = a² + b²", baseXp: 140, formula: "c² = a² + b²",
    fieldNote: { headline: "The most famous formula in all of math.", examples: ["The shortest path across a field", "How long a ladder must be", "TV screen size (the diagonal)"] },
    plots: { correct: "A right triangle: we know the two short sides. We want the long side (across).", distractors: ["We want the space inside a rectangle.", "We share a total equally."] },
    hint: "Square each short side (a × a, and b × b). Add them. The answer is the number that, times itself, gives that sum.",
  },
};

/* ── story skins per voice — simple English + word glossaries ─ */
/* glossary: tap any underlined word in the app to see its simple meaning */
const SKINS = {
  real: {
    takeaway: [
      { title: "Buying the Hoodie", text: (A, B) => `You saved ${A} rupees. You spend ${B} rupees on a hoodie you wanted for months. How much money is left?`, unit: "rupees left", glossary: { saved: "kept money instead of spending it", hoodie: "a warm jacket with a hood" } },
      { title: "Phone Space", text: (A, B) => `Your phone has ${A} GB of free space. A new game needs ${B} GB. How much free space will be left after you install it?`, unit: "GB", glossary: { install: "put an app on your phone", "free space": "empty storage on your phone" } },
    ],
    ratedrain: [
      { title: "Battery Math", text: (S, r, E) => `Your phone battery is at ${S}%. Watching videos uses ${r}% every hour. After how many hours will it reach ${E}%?`, unit: "hours", glossary: { battery: "the part that gives your phone power" } },
      { title: "The Water Bottle Walk", text: (S, r, E) => `Your bottle has ${S} ml of water. You drink about ${r} ml every kilometer you walk. After how many kilometers will only ${E} ml be left?`, unit: "km", glossary: { kilometer: "1000 meters — about a 12-minute walk" } },
    ],
    ratebuild: [
      { title: "Shoe Money", text: (b, r, T) => `You already have ${b} rupees saved. You add ${r} rupees every week. After how many weeks will you reach ${T} rupees — enough for the shoes?`, unit: "weeks", glossary: { reach: "get to / arrive at" } },
      { title: "The Auto Ride", text: (b, r, T) => `An auto costs ${b} rupees to start, plus ${r} rupees for each kilometer. The ride home cost ${T} rupees. How many kilometers was the ride?`, unit: "km", glossary: { auto: "a three-wheel taxi (auto-rickshaw)" } },
    ],
    fairsplit: [
      { title: "Pizza Night", text: (T, n) => `The pizza bill is ${T} rupees, shared equally between ${n} friends. How much does each friend pay?`, unit: "rupees each", glossary: { bill: "the total money to pay", equally: "the same amount for everyone" } },
      { title: "Team Snacks", text: (T, n) => `${T} snacks are shared equally among ${n} players after practice. How many snacks does each player get?`, unit: "snacks each", glossary: { practice: "training time for a sport" } },
    ],
  },
  arcade: {
    takeaway: [
      { title: "Token Drop", text: (A, B) => `You have ${A} game tokens. You use ${B} tokens on the claw machine. How many tokens are left?`, unit: "tokens", glossary: { tokens: "coins used to play arcade games", "claw machine": "a game where a metal claw tries to grab prizes" } },
      { title: "Lives Lost", text: (A, B) => `Your team starts with ${A} lives. A hard level takes ${B} lives. How many lives are left?`, unit: "lives", glossary: { lives: "chances to play before game over" } },
    ],
    ratedrain: [
      { title: "Power Bar Drop", text: (S, r, E) => `Your power bar is at ${S} points. Each battle uses ${r} points. After how many battles will it be at ${E} points?`, unit: "battles", glossary: { "power bar": "the line that shows your energy in a game" } },
      { title: "Shield Charge", text: (S, r, E) => `Your shield has ${S} charge. It loses ${r} charge every minute. After how many minutes will it have ${E} charge?`, unit: "minutes", glossary: { shield: "a cover that protects you in a game", charge: "stored energy" } },
    ],
    ratebuild: [
      { title: "High Score Run", text: (b, r, T) => `You start a level with ${b} points. You get ${r} points for each coin you grab. You finish with ${T} points. How many coins did you grab?`, unit: "coins", glossary: {} },
      { title: "Ticket Counter", text: (b, r, T) => `You already have ${b} prize tickets. Each win gives you ${r} more tickets. Now you have ${T} tickets. How many games did you win?`, unit: "wins", glossary: { "prize tickets": "paper tickets you trade for prizes at the counter" } },
    ],
    fairsplit: [
      { title: "Co-op Loot", text: (T, n) => `Your team wins ${T} gems. They are shared equally between ${n} players. How many gems does each player get?`, unit: "gems each", glossary: { "co-op": "playing together as a team", gems: "shiny game treasure" } },
      { title: "Token Share", text: (T, n) => `${T} tokens are shared equally among ${n} friends at the arcade. How many tokens does each friend get?`, unit: "tokens each", glossary: {} },
    ],
  },
};


/* skins shared by all voices for the formula concepts */
const SKINS_COMMON = {
  percent: [
    { title: "The Shop Discount", text: (P, N) => `A shop gives ${P}% off. The jacket costs ${N} rupees. How much money do you save?`, unit: "rupees saved", glossary: { discount: "money taken off the price", off: "less to pay" } },
    { title: "The Test Marks", text: (P, N) => `A test has ${N} marks in total. You got ${P}% of the marks. How many marks did you get?`, unit: "marks", glossary: { marks: "points in a test" } },
  ],
  average: [
    { title: "Three Game Scores", text: (a, b, c) => `You scored ${a}, ${b} and ${c} points in three games. What is your average score?`, unit: "points (average)", glossary: { average: "the 'middle' value: total divided by how many" } },
    { title: "Three Day Steps", text: (a, b, c) => `You walked ${a}, ${b} and ${c} steps (in hundreds) on three days. What is your average per day?`, unit: "hundreds of steps", glossary: { average: "the 'middle' value: total divided by how many" } },
  ],
  speed: [
    { title: "The Bus Trip", text: (D, Sp) => `A bus travels at ${Sp} km per hour. The trip is ${D} km long. How many hours does the trip take?`, unit: "hours", glossary: { travels: "moves / goes", per: "for each" } },
    { title: "The Cycle Ride", text: (D, Sp) => `You cycle at ${Sp} km per hour. Your friend lives ${D} km away. How many hours will it take to reach there?`, unit: "hours", glossary: { reach: "arrive at / get to" } },
  ],
  arearect: [
    { title: "The Room Floor", text: (l, w) => `A room is ${l} meters long and ${w} meters wide. What is the area of the floor?`, unit: "square meters", glossary: { area: "the flat space inside a shape", wide: "how big from side to side" } },
    { title: "The Poster", text: (l, w) => `A poster is ${l} cm long and ${w} cm wide. What is its area?`, unit: "square cm", glossary: { area: "the flat space inside a shape" } },
  ],
  simpleinterest: [
    { title: "The Bank Savings", text: (P, R, Ty) => `You keep ${P} rupees in a bank. The bank pays ${R}% interest each year. How much interest do you get after ${Ty} years?`, unit: "rupees interest", glossary: { interest: "extra money the bank gives you for saving", pays: "gives" } },
    { title: "The Small Loan", text: (P, R, Ty) => `A person borrows ${P} rupees at ${R}% interest per year. How much interest must they pay after ${Ty} years?`, unit: "rupees interest", glossary: { borrows: "takes money that must be given back", interest: "extra money paid for borrowing" } },
  ],
  pythagoras: [
    { title: "Across the Field", text: (a, b) => `A field is ${a} meters long and ${b} meters wide. You walk in a straight line from one corner to the opposite corner. How long is that walk?`, unit: "meters", glossary: { corner: "the point where two sides meet", opposite: "on the other side" } },
    { title: "The Ladder", text: (a, b) => `The bottom of a ladder is ${a} meters from a wall. The top touches the wall ${b} meters up. How long is the ladder?`, unit: "meters", glossary: { ladder: "steps you climb, leaning on a wall" } },
  ],
};

/* ── quest generator (now emits viz data for diagrams) ──────── */
function generateQuest(conceptKey, rng, { daily = false, boss = false, tier = 0, voice = "real", bankId = null } = {}) {
  const c = CONCEPTS[conceptKey];
  const skinPool = (SKINS[voice] && SKINS[voice][conceptKey]) || SKINS_COMMON[conceptKey];
  const skin = pick(rng, skinPool);
  const m = boss ? 2.6 : [1, 1.6, 2.4, 3.4][tier];
  let tokens, seq, answer, raw, viz;

  if (conceptKey === "takeaway") {
    const A = rint(rng, Math.round(30 * m), Math.round(95 * m)), B = rint(rng, 8, A - 10);
    answer = A - B; raw = skin.text(A, B);
    viz = { type: "takeaway", A, B };
    tokens = [
      { id: "a", phrase: "starting amount", token: `${A}` }, { id: "b", phrase: "taken away", token: "−" },
      { id: "c", phrase: "amount gone", token: `${B}` }, { id: "d", phrase: "what remains", token: "= R" },
      { id: "x", phrase: "doubles over time", token: "× 2", decoy: true },
    ];
    seq = [`${A}`, "−", `${B}`, "= R"];
  } else if (conceptKey === "ratedrain") {
    const r = rint(rng, 3, Math.round(8 * m)), t = rint(rng, 5, Math.min(12, Math.round(15 * Math.min(m, 1.5)))), E = rint(rng, 10, 40);
    const Sv = E + r * t; answer = t; raw = skin.text(Sv, r, E);
    viz = { type: "ratedrain", S: Sv, r, E, t };
    tokens = [
      { id: "a", phrase: "starts at", token: `${Sv}` }, { id: "b", phrase: "drops each time", token: `− ${r}·t` },
      { id: "c", phrase: "reaches", token: `= ${E}` }, { id: "x", phrase: "split in half", token: "÷ 2", decoy: true },
    ];
    seq = [`${Sv}`, `− ${r}·t`, `= ${E}`];
  } else if (conceptKey === "ratebuild") {
    const b = rint(rng, 4, Math.round(30 * m)) * 5, r = rint(rng, 3, Math.round(9 * Math.min(m, 2))), x = rint(rng, 6, Math.min(14, Math.round(25 * Math.min(m, 1.2))));
    const T = b + r * x; answer = x; raw = skin.text(b, r, T);
    viz = { type: "ratebuild", b, r, x, T };
    tokens = [
      { id: "a", phrase: "base / already have", token: `${b}` }, { id: "b", phrase: "plus", token: "+" },
      { id: "c", phrase: "for each one", token: `${r}·x` }, { id: "d", phrase: "totals", token: `= ${T}` },
      { id: "x", phrase: "minus the rate", token: `− ${r}`, decoy: true },
    ];
    seq = [`${b}`, "+", `${r}·x`, `= ${T}`];
  } else if (conceptKey === "percent") {
    const P = pick(rng, [5, 10, 15, 20, 25, 30, 40, 50, 75]);
    const N = rint(rng, 2, Math.round(10 * m)) * 20;
    answer = (P * N) / 100; raw = skin.text(P, N);
    viz = { type: "percent", P, N, part: answer };
    tokens = [
      { id: "a", phrase: "the full amount", token: `${N}` }, { id: "b", phrase: "percent of", token: `× ${P}` },
      { id: "c", phrase: "out of every 100", token: "÷ 100" }, { id: "d", phrase: "the part we want", token: "= part" },
      { id: "x", phrase: "added to", token: `+ ${P}`, decoy: true },
    ];
    seq = [`${N}`, `× ${P}`, "÷ 100", "= part"];
  } else if (conceptKey === "average") {
    const avg = rint(rng, 5, Math.round(20 * m));
    const d1 = rint(rng, 1, Math.max(2, Math.round(avg / 3))), d2 = rint(rng, 1, Math.max(2, Math.round(avg / 3)));
    const a = avg + d1, b = avg - d2, cc = 3 * avg - a - b;
    answer = avg; raw = skin.text(a, b, cc);
    viz = null;
    tokens = [
      { id: "a", phrase: "add them all", token: `${a} + ${b} + ${cc}` }, { id: "b", phrase: "divide by", token: "÷" },
      { id: "c", phrase: "how many numbers", token: "3" }, { id: "d", phrase: "the average", token: "= avg" },
      { id: "x", phrase: "times", token: "× 3", decoy: true },
    ];
    seq = [`${a} + ${b} + ${cc}`, "÷", "3", "= avg"];
  } else if (conceptKey === "speed") {
    const Sp = rint(rng, 2, Math.round(6 * m)) * 10, t = rint(rng, 2, Math.min(9, 2 + Math.round(2 * m)));
    const D = Sp * t; answer = t; raw = skin.text(D, Sp);
    viz = null;
    tokens = [
      { id: "a", phrase: "the distance", token: `${D}` }, { id: "b", phrase: "divide by", token: "÷" },
      { id: "c", phrase: "the speed", token: `${Sp}` }, { id: "d", phrase: "the time", token: "= hours" },
      { id: "x", phrase: "times the speed", token: `× ${Sp}`, decoy: true },
    ];
    seq = [`${D}`, "÷", `${Sp}`, "= hours"];
  } else if (conceptKey === "arearect") {
    const l = rint(rng, 3, Math.round(9 * m)), w = rint(rng, 2, Math.round(7 * m));
    answer = l * w; raw = skin.text(l, w);
    viz = { type: "arearect", l, w };
    tokens = [
      { id: "a", phrase: "the length", token: `${l}` }, { id: "b", phrase: "times", token: "×" },
      { id: "c", phrase: "the width", token: `${w}` }, { id: "d", phrase: "the area", token: "= area" },
      { id: "x", phrase: "plus", token: "+", decoy: true },
    ];
    seq = [`${l}`, "×", `${w}`, "= area"];
  } else if (conceptKey === "simpleinterest") {
    const P = rint(rng, 1, Math.round(5 * m)) * 500, R = rint(rng, 2, 10), Ty = rint(rng, 1, 5);
    answer = (P * R * Ty) / 100; raw = skin.text(P, R, Ty);
    viz = null;
    tokens = [
      { id: "a", phrase: "money × percent × years", token: `${P} × ${R} × ${Ty}` }, { id: "b", phrase: "divide by", token: "÷" },
      { id: "c", phrase: "one hundred", token: "100" }, { id: "d", phrase: "the interest", token: "= SI" },
      { id: "x", phrase: "times 100", token: "× 100", decoy: true },
    ];
    seq = [`${P} × ${R} × ${Ty}`, "÷", "100", "= SI"];
  } else if (conceptKey === "pythagoras") {
    const triples = tier <= 1 ? [[3, 4, 5], [6, 8, 10], [5, 12, 13]] : [[9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25], [20, 21, 29]];
    const [a, b, cc] = pick(rng, triples);
    answer = cc; raw = skin.text(a, b);
    viz = null;
    tokens = [
      { id: "a", phrase: "first side squared", token: `${a * a}` }, { id: "b", phrase: "plus", token: "+" },
      { id: "c", phrase: "second side squared", token: `${b * b}` }, { id: "d", phrase: "the long side squared", token: "= c²" },
      { id: "x", phrase: "minus", token: "−", decoy: true },
    ];
    seq = [`${a * a}`, "+", `${b * b}`, "= c²"];
  } else {
    const each = rint(rng, 6, Math.round(15 * m)), n = rint(rng, 3, Math.min(8, Math.round(8 * Math.min(m, 1.4))));
    const T = each * n; answer = each; raw = skin.text(T, n);
    viz = { type: "fairsplit", T, n, each };
    tokens = [
      { id: "a", phrase: "the full total", token: `${T}` }, { id: "b", phrase: "split evenly among", token: "÷" },
      { id: "c", phrase: "number of shares", token: `${n}` }, { id: "d", phrase: "each one gets", token: "= each" },
      { id: "x", phrase: "combined with", token: "+", decoy: true },
    ];
    seq = [`${T}`, "÷", `${n}`, "= each"];
  }

  const plotOptions = [c.plots.correct, ...c.plots.distractors].map((p) => ({ p, k: rng() })).sort((a, b) => a.k - b.k).map((o) => o.p);
  const xp = Math.round(c.baseXp * (boss ? 3 : daily ? 2 : TIER_XP[tier]));
  return {
    id: `${conceptKey}-${Math.floor(rng() * 1e9)}`,
    concept: conceptKey, tier: boss ? 2 : tier, title: skin.title,
    unit: skin.unit, raw, deQuantized: raw.replace(/\d+(\.\d+)?/g, () => "▓▓"),
    plotOptions, correctPlot: plotOptions.indexOf(c.plots.correct),
    tokens, correctSequence: seq, answer, hint: c.hint, xp, daily, boss, custom: false, viz,
    glossary: skin.glossary || {}, bankId,
  };
}

/* ── AI Case Forge ──────────────────────────────────────────── */
async function forgeAIQuest(theme, tier, voice) {
  const conceptList = Object.entries(CONCEPTS).map(([k, c]) => `"${k}" (${c.short})`).join(", ");
  const flavor = voice === "arcade" ? "Give it a fun video-game / arcade flavor (levels, tokens, power-ups)." : "Make it feel like real everyday teenage life — realistic prices, realistic situations.";
  const system = `You write algebra word problems for a math game for a 14-year-old with math anxiety who is still learning English. CRITICAL: use very simple English — short sentences, common everyday words only. Respond ONLY with raw JSON, no markdown fences, no preamble.`;
  const prompt = `Create ONE word problem themed around: "${theme}". ${flavor} Difficulty level ${tier + 1} of 4 (higher level = bigger numbers, NOT harder words).
Pick the best-fitting concept from: ${conceptList}.
JSON shape (exactly):
{"concept":"...","title":"short simple title","story":"2-3 SHORT sentences WITH real numbers, ending in a question","unit":"unit of the answer","glossary":{"any harder word used":"its meaning in very simple English"},"tokens":[{"phrase":"words from story","token":"math symbol/number"}],"sequence":["tokens in correct equation order"],"answer":123,"hint":"one short simple nudge, no answer","plot_correct":"one short simple line about what happens","plot_distractors":["wrong summary 1","wrong summary 2"]}
Rules: 3-4 tokens in sequence plus exactly 1 decoy (not in sequence). Every sequence item must EXACTLY match a token's "token" value (same characters). Answer must be a whole number that correctly solves the story.`;
  const q = await askForQuestJSON(system, prompt, 900);
  const plots = [q.plot_correct, ...q.plot_distractors].map((pp) => ({ pp, k: Math.random() })).sort((a, b) => a.k - b.k).map((o) => o.pp);
  return {
    id: `ai-${Date.now()}`, concept: q.concept, tier,
    title: `✨ ${q.title}`, unit: q.unit || "units",
    raw: q.story, deQuantized: q.story.replace(/\d+(\.\d+)?/g, () => "▓▓"),
    plotOptions: plots, correctPlot: plots.indexOf(q.plot_correct),
    tokens: q.tokens.map((t, i) => ({ id: `t${i}`, ...t })), correctSequence: q.sequence,
    answer: q.answer, hint: q.hint,
    xp: Math.round(CONCEPTS[q.concept].baseXp * TIER_XP[tier] * 1.2),
    daily: false, boss: false, custom: true, viz: null, glossary: q.glossary || {}, bankId: null,
  };
}

/* ── confidence engine: can go UP and DOWN ──────────────────────
   Per solve: clean (no AI, no retries)      → +1.0 × tier weight
              retries but no AI              → +0.6 × tier weight
              1 AI tip used                  → +0.3 × tier weight
              2+ AI tips on one case         → −0.15 × tier weight (small drop)
   Word help / "say it simply" NEVER counts — language is always free. */
function solveDelta(h) {
  const q = h.clean ? 1.0 : (h.aiUses ?? 0) >= 2 ? -0.15 : h.assist ? 0.3 : 0.6;
  return TIER_WEIGHT[h.tier ?? 0] * q;
}
function conceptConfidence(history, concept) {
  const w = Math.max(0, history.filter((h) => h.concept === concept).reduce((s, h) => s + solveDelta(h), 0));
  return Math.round(100 * (1 - Math.pow(0.62, w)));
}
function overallConfidence(history) {
  const keys = Object.keys(CONCEPTS);
  return Math.round(keys.reduce((s, k) => s + conceptConfidence(history, k), 0) / keys.length);
}
const confLabel = (v) => (v >= 80 ? "Mastered" : v >= 55 ? "Confident" : v >= 30 ? "Getting it" : v > 0 ? "Warming up" : "Not started");


/* ── THE 99 PROBLEM BANK ────────────────────────────────────────
   99 fixed problems: #1–#27 Easy, #28–#54 Medium, #55–#78 Hard,
   #79–#99 Advanced — cycling through all 10 concepts. Each number
   always gives the same problem (seeded), so students can say
   "I'm stuck on #43" and everyone sees the same case. */
const ALL_CONCEPT_KEYS = Object.keys(CONCEPTS);
const BANK = Array.from({ length: 99 }, (_, i) => {
  const n = i + 1;
  const tier = n <= 27 ? 0 : n <= 54 ? 1 : n <= 78 ? 2 : 3;
  return { n, tier, concept: ALL_CONCEPT_KEYS[i % ALL_CONCEPT_KEYS.length], seed: hashStr("decode-bank-" + n) };
});

/* ── loot / badges / milestones ─────────────────────────────── */
const RELICS = [
  { id: "chip", name: "Copper Chip", icon: "🟤", tier: "common" }, { id: "shard", name: "Static Shard", icon: "🪨", tier: "common" },
  { id: "coil", name: "Wire Coil", icon: "🧵", tier: "common" }, { id: "fuse", name: "Glass Fuse", icon: "🧊", tier: "common" },
  { id: "magnif", name: "Brass Magnifier", icon: "🔍", tier: "common" }, { id: "core", name: "Neon Core", icon: "🔮", tier: "rare" },
  { id: "key", name: "Cipher Key", icon: "🗝️", tier: "rare" }, { id: "pipe", name: "Calabash Pipe", icon: "🪈", tier: "rare" },
  { id: "cell", name: "Plasma Cell", icon: "⚗️", tier: "rare" }, { id: "sigil", name: "Quantum Sigil", icon: "🌀", tier: "legendary" },
  { id: "hound", name: "Hound of Baskerville", icon: "🐺", tier: "legendary" }, { id: "goldbug", name: "The Golden Bug", icon: "🪲", tier: "legendary" },
];
const TIER_META = { common: { label: "Common", color: "#9AA6C4" }, rare: { label: "Rare", color: "#7C9BFF" }, legendary: { label: "Legendary", color: "#FFB020" } };
function rollLoot(owned) {
  const r = Math.random();
  const tier = r < 0.06 ? "legendary" : r < 0.3 ? "rare" : "common";
  const pool = RELICS.filter((x) => x.tier === tier);
  const fresh = pool.filter((x) => !owned.includes(x.id));
  const list = fresh.length ? fresh : pool;
  const item = list[Math.floor(Math.random() * list.length)];
  return { item, duplicate: owned.includes(item.id) };
}
const BADGES = [
  { id: "first", name: "First Solve", desc: "Close your first case", Icon: Star, test: (s) => s.history.length >= 1 },
  { id: "clean", name: "Clean Solve", desc: "No retries, no help — pure you", Icon: Sparkles, test: (s) => s.history.some((h) => h.clean) },
  { id: "comeback", name: "Comeback", desc: "Crack it after 3+ misses — grit wins", Icon: Shield, test: (s) => s.history.some((h) => h.retries >= 3) },
  { id: "solo", name: "Solo Detective", desc: "3 cases in a row without the sidekick", Icon: Eye, test: (s) => { let run = 0; for (const h of s.history) { run = h.assist ? 0 : run + 1; if (run >= 3) return true; } return false; } },
  { id: "daily", name: "Daily Devotion", desc: "Complete a daily puzzle", Icon: Radio, test: (s) => s.history.some((h) => h.daily) },
  { id: "boss", name: "Giant Slayer", desc: "Defeat a boss case", Icon: Swords, test: (s) => s.history.some((h) => h.boss) },
  { id: "fire", name: "On Fire", desc: "3-case clean streak", Icon: Flame, test: (s) => s.maxCombo >= 3 },
  { id: "architect", name: "Case Architect", desc: "Solve a case YOU designed with the Forge", Icon: Wand2, test: (s) => s.history.some((h) => h.custom) },
  { id: "deep", name: "Deep Diver", desc: "Solve a Hard or Advanced case", Icon: Gem, test: (s) => s.history.some((h) => h.tier >= 2) },
  { id: "explorer", name: "Full Spectrum", desc: "Solve every concept type once", Icon: FolderOpen, test: (s) => Object.keys(CONCEPTS).every((k) => s.history.some((h) => h.concept === k)) },
  { id: "mastery", name: "Concept Mastery", desc: "Reach 80% confidence in any concept", Icon: Trophy, test: (s) => Object.keys(CONCEPTS).some((k) => conceptConfidence(s.history, k) >= 80) },
  { id: "five", name: "Session Streak", desc: "Close 5 cases in one session", Icon: TrendingUp, test: (s) => s.history.length >= 5 },
  { id: "quizwhiz", name: "Quiz Whiz", desc: "Score 5/5 on the daily quiz", Icon: HelpCircle, test: (s) => (s.bestQuiz ?? 0) >= 5 },
  { id: "sharp", name: "Sharp Shooter", desc: "Perfect 6/6 in the daily game", Icon: Gamepad2, test: (s) => (s.bestGame ?? 0) >= 6 },
  { id: "starter", name: "Star Student", desc: "Earn 3 topic stars from self-tests", Icon: Star, test: (s) => (s.topicStars ?? []).length >= 3 },
  { id: "formulamaster", name: "Formula Master", desc: "Perfect 8/8 in Formula Rush", Icon: Wand2, test: (s) => (s.bestFormula ?? 0) >= 8 },
  { id: "storyteller", name: "Storyteller", desc: "Finish a whole story season", Icon: BookOpen, test: (s) => (s.storyProgress ?? 0) >= STORY_SEASON.chapters.length },
];
const MILESTONES = [
  { xp: 0, title: "Novice" }, { xp: 200, title: "Signal Tracer" },
  { xp: 550, title: "Cipher Runner" }, { xp: 1100, title: "Master Cryptographer" },
];

/* ── theme construction: base mode × voice colors ───────────── */

/* ═══ THEME SYSTEM — four complete design languages.
   Visuals live HERE; worlds (real/arcade) are story packs only. ═══ */
const THEME_PACKS = {
  duo: {
    id: "duo", name: "Playful Bold", emoji: "🟢", hint: "Chunky, fun, game-like",
    dark: false, font: "'Nunito', system-ui, sans-serif",
    colors: { bg: "#FFFFFF", panel: "#FFFFFF", edge: "#E5E5E5", edgeStrong: "#D0D0D0", slot: "#F7F7F7", ink: "#3C3C3C", dim: "#9A9A9A", accent: "#58CC02", accentDark: "#46A302", onAccent: "#FFFFFF", gold: "#E6A817", teal: "#1CB0F6", violet: "#CE82FF" },
    style: { panel: 16, btn: 14, chip: 12, box: 12, border: 2, btn3d: true, shadow: "none", monoEyebrow: false },
  },
  notion: {
    id: "notion", name: "Paper Minimal", emoji: "⬜", hint: "Quiet, clean, notebook",
    dark: false, font: "'Inter', system-ui, sans-serif",
    colors: { bg: "#FFFFFF", panel: "#FFFFFF", edge: "#EBEBEA", edgeStrong: "#E0E0DE", slot: "#F7F7F5", ink: "#37352F", dim: "#9B9A97", accent: "#2E75CC", accentDark: "#2E75CC", onAccent: "#FFFFFF", gold: "#9F6B00", teal: "#0F7B6C", violet: "#6940A5" },
    style: { panel: 8, btn: 6, chip: 6, box: 6, border: 1, btn3d: false, shadow: "none", monoEyebrow: false },
  },
  midnight: {
    id: "midnight", name: "Midnight Pro", emoji: "⬛", hint: "Dark, sharp, pro",
    dark: true, font: "'Inter', system-ui, sans-serif",
    colors: { bg: "#0B0B0F", panel: "#131318", edge: "#26262E", edgeStrong: "#33333D", slot: "#1A1A21", ink: "#F4F4F6", dim: "#8A8A96", accent: "#7C6FFF", accentDark: "#6A5CFF", onAccent: "#FFFFFF", gold: "#E8C468", teal: "#4CC9A6", violet: "#A88BFF" },
    style: { panel: 12, btn: 9, chip: 8, box: 8, border: 1, btn3d: false, shadow: "0 0 0 1px rgba(124,111,255,0.07)", monoEyebrow: true },
  },
  calm: {
    id: "calm", name: "Soft Focus", emoji: "🟠", hint: "Warm, airy, calming",
    dark: false, font: "'Nunito', system-ui, sans-serif",
    colors: { bg: "#FAF6F0", panel: "#FFFFFF", edge: "#F0E9DF", edgeStrong: "#E7DDCE", slot: "#FBF8F3", ink: "#3D3A36", dim: "#A39C92", accent: "#F0842C", accentDark: "#E0731B", onAccent: "#FFFFFF", gold: "#D9A441", teal: "#5E9678", violet: "#B08BC9" },
    style: { panel: 22, btn: 999, chip: 14, box: 14, border: 0, btn3d: false, shadow: "0 6px 20px rgba(160,130,90,0.10)", monoEyebrow: false },
  },
};

function buildPalette(themeKey) {
  const TH = THEME_PACKS[themeKey] || THEME_PACKS.duo;
  const v = TH.colors;
  return {
    bg: v.bg, panel: v.panel, edge: v.edge, edgeStrong: v.edgeStrong, edgeSoft: v.edge + "99", slot: v.slot,
    ink: v.ink, dim: v.dim, accent: v.accent, accentDark: v.accentDark, onAccent: v.onAccent,
    accentGrad: v.accent, gold: v.gold, teal: v.teal, violet: v.violet,
    grid: v.edge, axis: v.dim,
    shadow: TH.style.shadow !== "none" ? TH.style.shadow : TH.dark ? "0 10px 32px rgba(0,0,0,0.45)" : "none",
    accentSoft: v.accent + (TH.dark ? "26" : "1C"), tealSoft: v.teal + "1E", violetSoft: v.violet + "1C", goldSoft: v.gold + "20",
  };
}

/* ── user-selectable font packs (profile setting) ───────────── */
const FONT_CHOICES = {
  default: { label: "Theme default", hint: "Matches your theme" },
  clean:   { label: "Clean",  hint: "Modern & simple",  display: "'Outfit', system-ui, sans-serif",  body: "'Outfit', system-ui, sans-serif" },
  friendly:{ label: "Friendly", hint: "Round & soft",   display: "'Nunito', system-ui, sans-serif",  body: "'Nunito', system-ui, sans-serif" },
  book:    { label: "Book",   hint: "Like a storybook", display: "'Fraunces', Georgia, serif",       body: "'Lora', Georgia, serif" },
};
function resolveFonts(TH, choice) {
  const base = { display: TH.font, body: TH.font, mono: "'JetBrains Mono', monospace", h1: 24, big: 29, logo: 20 };
  if (!choice || choice === "default") return base;
  const f = FONT_CHOICES[choice];
  return { ...base, display: f.display, body: f.body };
}

/* ── responsive: one hook, styles adapt everywhere ──────────── */
function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 540 : false);
  useEffect(() => {
    const f = () => setM(window.innerWidth < 540);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return m;
}

function makeStyles(T, F, TH, mobile) {
  const st = TH.style;
  const R = { panel: st.panel, btn: st.btn, chip: st.chip, box: st.box };
  return {
    app: { minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: F.body, display: "flex", justifyContent: "center", padding: mobile ? "12px 10px 70px" : "20px 16px 80px", transition: "background .5s ease,color .5s ease" },
    shell: { width: "100%", maxWidth: 720 },
    h1: { fontFamily: F.display, fontSize: Math.max((F.h1 || 24) - (mobile ? 3 : 0), 13), fontWeight: 800, margin: "8px 0 4px", letterSpacing: "-0.015em", lineHeight: 1.35 },
    eyebrow: { fontFamily: st.monoEyebrow ? F.mono : F.body, fontSize: 11, letterSpacing: st.monoEyebrow ? "0.14em" : "0.03em", textTransform: st.monoEyebrow ? "uppercase" : "none", color: T.dim, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 },
    panel: { background: T.panel, border: st.border ? `${st.border}px solid ${T.edge}` : "none", borderRadius: R.panel, padding: mobile ? 16 : 22, marginTop: mobile ? 12 : 16, boxShadow: T.shadow === "none" ? undefined : T.shadow, transition: "background .5s ease,border .5s ease" },
    btn: (primary, grad) => ({
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: mobile ? "12px 18px" : "13px 24px", borderRadius: R.btn,
      border: primary ? "none" : `${Math.max(st.border, 1)}px solid ${T.edgeStrong}`,
      borderBottom: st.btn3d ? `4px solid ${primary ? T.accentDark : T.edgeStrong}` : undefined,
      background: primary ? (grad || T.accent) : T.panel,
      color: primary ? T.onAccent : T.ink,
      fontFamily: F.body, fontWeight: 800, fontSize: 14.5,
      textTransform: st.btn3d && primary ? "uppercase" : "none",
      letterSpacing: st.btn3d && primary ? "0.04em" : 0,
      cursor: "pointer",
    }),
    chip: (active) => ({ padding: "12px 15px", borderRadius: R.chip, border: `${Math.max(st.border, 1)}px solid ${active ? T.accent : T.edgeStrong}`, background: active ? T.accentSoft : T.panel, color: active ? T.accent : T.ink, fontFamily: F.body, fontWeight: 800, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }),
    storyBox: { fontFamily: F.body, fontSize: mobile ? 15 : 16.5, fontWeight: 500, lineHeight: 1.85, background: T.slot, padding: mobile ? 13 : 18, borderRadius: R.box, border: `1px solid ${T.edgeSoft}` },
    feedback: { marginTop: 12, padding: "12px 15px", borderRadius: R.box, border: `1px solid ${T.gold}55`, background: T.goldSoft, color: T.gold, fontSize: 13.5, fontWeight: 700, lineHeight: 1.55 },
    good: { marginTop: 12, padding: "12px 15px", borderRadius: R.box, border: `1px solid ${T.teal}55`, background: T.tealSoft, color: T.teal, fontSize: 13.5, fontWeight: 700, lineHeight: 1.55 },
  };
}

const UICtx = createContext(null);
const useUI = () => useContext(UICtx);

/* ── concept visualizer: bar models & staircases ────────────── */
function ConceptVisual({ viz, showAnswer = false }) {
  const { T, F } = useUI();
  if (!viz) return null;
  const W = 340, lbl = { fontFamily: F.mono, fontSize: 11, fill: T.dim };
  const box = (x, y, w, h, fill, stroke) => <rect x={x} y={y} width={Math.max(w, 2)} height={h} rx={5} fill={fill} stroke={stroke} strokeWidth="1.5" />;

  if (viz.type === "takeaway") {
    const { A, B } = viz;
    const total = W - 40, wB = (B / A) * total, wR = total - wB;
    return (
      <svg viewBox={`0 0 ${W} 96`} style={{ width: "100%" }} role="img" aria-label="Bar model: whole minus part">
        <text x={20} y={16} style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>whole: {A}</text>
        {box(20, 24, total, 30, T.slot, T.edge)}
        {box(20, 24, wB, 30, T.gold + "55", T.gold)}
        {box(20 + wB, 24, wR, 30, T.teal + "44", T.teal)}
        <text x={20 + wB / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.gold, fontWeight: 700 }}>gone: {B}</text>
        <text x={20 + wB + wR / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.teal, fontWeight: 700 }}>{showAnswer ? `left: ${A - B}` : "left: ?"}</text>
        <text x={20} y={80} style={lbl}>the whole bar is what you started with — one piece leaves</text>
      </svg>
    );
  }
  if (viz.type === "fairsplit") {
    const { T: total, n, each } = viz;
    const bw = (W - 40) / n;
    return (
      <svg viewBox={`0 0 ${W} 96`} style={{ width: "100%" }} role="img" aria-label="Bar model: equal shares">
        <text x={20} y={16} style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>total: {total}, split into {n} equal parts</text>
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            {box(20 + i * bw + 2, 24, bw - 4, 30, T.teal + "33", T.teal)}
            <text x={20 + i * bw + bw / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.teal, fontWeight: 700 }}>{showAnswer ? each : "?"}</text>
          </g>
        ))}
        <text x={20} y={80} style={lbl}>every part must be the same size — that's the whole trick</text>
      </svg>
    );
  }
  if (viz.type === "ratebuild") {
    const { b, r, x, T: total } = viz;
    const tot = W - 40, wb = (b / total) * tot, wchunk = ((r) / total) * tot;
    const chunks = Math.min(x, 14);
    return (
      <svg viewBox={`0 0 ${W} 104`} style={{ width: "100%" }} role="img" aria-label="Bar model: base plus repeated chunks">
        <text x={20} y={16} style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>total: {total}</text>
        {box(20, 24, wb, 30, T.gold + "55", T.gold)}
        <text x={20 + wb / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.gold, fontWeight: 700 }}>base {b}</text>
        {Array.from({ length: chunks }, (_, i) => (
          <g key={i}>{box(20 + wb + i * wchunk + 1, 24, wchunk - 2, 30, T.teal + "33", T.teal)}</g>
        ))}
        <text x={20 + wb + (chunks * wchunk) / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.teal, fontWeight: 700 }}>{showAnswer ? `${x} × ${r}` : `? × ${r}`}</text>
        <text x={20} y={80} style={lbl}>strip off the base, then count how many {r}-chunks fill the rest</text>
        <text x={20} y={96} style={lbl}>{showAnswer ? `(${total} − ${b}) ÷ ${r} = ${x}` : `(${total} − ${b}) ÷ ${r} = ?`}</text>
      </svg>
    );
  }
  if (viz.type === "percent") {
    const { P, N, part } = viz;
    const total = W - 40, wp = (P / 100) * total;
    return (
      <svg viewBox={`0 0 ${W} 92`} style={{ width: "100%" }} role="img" aria-label="Percent bar">
        <text x={20} y={16} style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>the whole = {N} (that is 100%)</text>
        {box(20, 24, total, 30, T.slot, T.edge)}
        {box(20, 24, wp, 30, T.teal + "44", T.teal)}
        <text x={20 + wp / 2} y={44} textAnchor="middle" style={{ ...lbl, fill: T.teal, fontWeight: 700 }}>{P}% = {showAnswer ? part : "?"}</text>
        <text x={20} y={78} style={lbl}>{P} out of every 100 · {showAnswer ? `(${P} × ${N}) ÷ 100 = ${part}` : `(${P} × ${N}) ÷ 100 = ?`}</text>
      </svg>
    );
  }
  if (viz.type === "arearect") {
    const { l, w } = viz;
    const scale = Math.min((W - 80) / l, 52 / w);
    const rw = l * scale, rh = Math.max(w * scale, 22);
    return (
      <svg viewBox={`0 0 ${W} ${rh + 52}`} style={{ width: "100%" }} role="img" aria-label="Rectangle with length and width">
        {box(40, 14, rw, rh, T.teal + "22", T.teal)}
        <text x={40 + rw / 2} y={rh + 30} textAnchor="middle" style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>length = {l}</text>
        <text x={26} y={14 + rh / 2} textAnchor="middle" style={{ ...lbl, fill: T.ink, fontWeight: 700 }} transform={`rotate(-90 26 ${14 + rh / 2})`}>width = {w}</text>
        <text x={40 + rw / 2} y={16 + rh / 2} textAnchor="middle" style={{ ...lbl, fill: T.teal, fontWeight: 700 }}>area = {showAnswer ? l * w : "?"}</text>
      </svg>
    );
  }
  if (viz.type === "ratedrain") {
    const { S: start, r, E, t } = viz;
    const steps = Math.min(t, 12);
    const x0 = 24, y0 = 22, stepW = (W - 60) / steps, stepH = 44 / steps;
    return (
      <svg viewBox={`0 0 ${W} 108`} style={{ width: "100%" }} role="img" aria-label="Staircase down from start to end">
        <text x={x0} y={14} style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>start: {start}</text>
        {Array.from({ length: steps }, (_, i) => (
          <g key={i}>
            <line x1={x0 + i * stepW} y1={y0 + i * stepH} x2={x0 + (i + 1) * stepW} y2={y0 + i * stepH} stroke={T.teal} strokeWidth="2.5" />
            <line x1={x0 + (i + 1) * stepW} y1={y0 + i * stepH} x2={x0 + (i + 1) * stepW} y2={y0 + (i + 1) * stepH} stroke={T.gold} strokeWidth="2.5" strokeDasharray="3 2" />
          </g>
        ))}
        <text x={W - 24} y={y0 + steps * stepH + 16} textAnchor="end" style={{ ...lbl, fill: T.ink, fontWeight: 700 }}>end: {E}</text>
        <text x={x0} y={92} style={lbl}>each dashed drop = −{r} · count the drops: {showAnswer ? `${t} steps` : "? steps"}</text>
        <text x={x0} y={106} style={lbl}>{showAnswer ? `(${start} − ${E}) ÷ ${r} = ${t}` : `(${start} − ${E}) ÷ ${r} = ?`}</text>
      </svg>
    );
  }
  return null;
}


/* ── WORD HELP: tap any word for a simple meaning ───────────── */
/* Language help is ALWAYS free and unlimited. It never counts
   as math help — English must never be the barrier. */
const wordCache = {};
function StoryText({ text, glossary = {} }) {
  const { T, S, F } = useUI();
  const [popup, setPopup] = useState(null); // {word, meaning, loading}
  const gl = useMemo(() => {
    const m = {};
    Object.entries(glossary).forEach(([k, v]) => (m[k.toLowerCase()] = v));
    return m;
  }, [glossary]);

  const lookup = async (rawWord) => {
    const word = rawWord.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
    if (!word || word.length < 3) return;
    if (gl[word]) { setPopup({ word, meaning: gl[word] }); return; }
    if (wordCache[word]) { setPopup({ word, meaning: wordCache[word] }); return; }
    setPopup({ word, loading: true });
    try {
      const meaning = await askClaude(
        "You explain English words to a 14-year-old who is learning English. Answer with ONE short simple sentence. If helpful, add one tiny example in brackets. No extra text.",
        [{ role: "user", content: `What does "${word}" mean here: "${text}"` }], 90
      );
      wordCache[word] = meaning;
      setPopup({ word, meaning });
    } catch { setPopup({ word, meaning: "Could not load — tap again." }); }
  };

  // split into words; glossary words get a dotted underline, every word is tappable
  const parts = text.split(/(\s+)/);
  return (
    <div>
      <p style={{ ...S.storyBox, marginBottom: 8 }}>
        {parts.map((p, i) => {
          if (/^\s+$/.test(p)) return p;
          const clean = p.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
          const inGloss = !!gl[clean];
          return (
            <span key={i} onClick={() => lookup(p)}
              style={{ cursor: "pointer", borderBottom: inGloss ? `2px dotted ${T.accent}` : "none", borderRadius: 2 }}
              title={inGloss ? "tap for meaning" : "tap any word to learn it"}>
              {p}
            </span>
          );
        })}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.dim }}>
          📖 Tap any word to see its meaning — word help is always free.
        </span>
      </div>
      {popup && (
        <div className="pd-pop" style={{ marginTop: 8, padding: "11px 14px", borderRadius: 12, border: `1px solid ${T.edgeStrong}`, background: T.slot, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 15 }}>📖</span>
          <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            <strong style={{ color: T.accent }}>{popup.word}</strong>{" — "}
            {popup.loading ? <span style={{ color: T.dim }}>loading…</span> : <span>{popup.meaning}</span>}
          </div>
          <button onClick={() => setPopup(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.dim, cursor: "pointer", fontWeight: 700 }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ── "Say it more simply" — AI rewrites the story, free ─────── */
function SimplifyButton({ text }) {
  const { T, S } = useUI();
  const [simple, setSimple] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (simple) { setSimple(null); return; }
    setBusy(true);
    try {
      const out = await askClaude(
        "Rewrite the given text in VERY simple English for a 14-year-old learning English. Very short sentences. Only common words. Keep every ▓▓ exactly as ▓▓. Keep all numbers exactly the same. Answer with only the rewritten text.",
        [{ role: "user", content: text }], 200
      );
      setSimple(out);
    } catch { setSimple("Could not load — try again."); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button style={{ ...S.btn(false), padding: "8px 14px", fontSize: 13 }} onClick={go} disabled={busy}>
        {busy ? <><Loader2 size={14} className="pd-spin" /> Making it simpler…</> : simple ? "Hide simple version" : "🪄 Say it more simply"}
      </button>
      {simple && (
        <div className="pd-pop" style={{ marginTop: 8, padding: "12px 15px", borderRadius: 12, border: `1px solid ${T.edgeStrong}`, background: T.slot, fontSize: 14.5, fontWeight: 600, lineHeight: 1.75 }}>
          {simple}
        </div>
      )}
    </div>
  );
}


/* ── back button ────────────────────────────────────────────── */
function BackBtn({ onClick, label = "Back" }) {
  const { T } = useUI();
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", marginBottom: 10, borderRadius: 999, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
      <ArrowLeft size={14} /> {label}
    </button>
  );
}

/* ── step progress indicator ────────────────────────────────── */
function Stepper({ current }) {
  const { T, F, V } = useUI();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 6px", flexWrap: "wrap" }}>
      {V.steps.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F.mono, fontSize: 11, fontWeight: 700, background: i < current ? T.teal : i === current ? T.accent : T.slot, color: i <= current ? "#fff" : T.dim, border: i > current ? `1.5px solid ${T.edge}` : "none", transition: "all .3s ease" }}>
              {i < current ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: i === current ? T.accent : T.dim }}>{s}</span>
          </div>
          {i < V.steps.length - 1 && <div style={{ flex: 1, minWidth: 14, height: 2, borderRadius: 2, background: i < current ? T.teal : T.edge }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── shared bits ────────────────────────────────────────────── */
function Bar({ value, color }) {
  const { T } = useUI();
  const c = color || T.teal;
  return (
    <div style={{ height: 9, borderRadius: 6, background: T.slot, border: `1px solid ${T.edgeSoft}`, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 6, background: c, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
    </div>
  );
}
function QuoteBanner() {
  const { T, F, V } = useUI();
  const [i, setI] = useState(() => Math.floor(Math.random() * V.quotes.length));
  useEffect(() => { const t = setInterval(() => setI((v) => (v + 1) % V.quotes.length), 7000); return () => clearInterval(t); }, [V]);
  return (
    <div style={{ marginTop: 14, padding: "13px 18px", borderRadius: 12, border: `1px solid ${T.edge}`, background: T.panel, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 11 }}>
      <Sparkles size={17} color={T.gold} style={{ flexShrink: 0 }} />
      <div key={`${V.id}-${i}`} className="pd-quote" style={{ fontFamily: F.display, fontSize: 14.5, fontWeight: 600, color: T.ink, fontStyle: "normal" }}>
        {V.quotes[i % V.quotes.length]}
      </div>
    </div>
  );
}
function Confetti() {
  const { T } = useUI();
  const colors = [T.accent, T.accentDark, T.gold, T.teal];
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.6 + Math.random() * 1.2,
    color: colors[i % colors.length], size: 6 + Math.random() * 6, rot: Math.random() * 360,
  })), []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: 20 }} aria-hidden>
      {bits.map((b, i) => (
        <div key={i} className="pd-confetti" style={{ position: "absolute", top: -12, left: `${b.left}%`, width: b.size, height: b.size * 0.6, background: b.color, borderRadius: 2, transform: `rotate(${b.rot}deg)`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }} />
      ))}
    </div>
  );
}

/* ── AI sidekick with "attempt before assistance" pushback ──── */
function SidekickChat({ quest, attempt, onAssist, compact = false }) {
  const { T, S, F, V } = useUI();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [retriesAtLastAsk, setRetriesAtLastAsk] = useState(-1);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const userAsks = msgs.filter((m) => m.role === "user").length;
  // PUSHBACK: 2 free questions per case; after that, must make a new attempt first
  const locked = userAsks >= 2 && attempt.retries === retriesAtLastAsk;
  const QUICK = ["Where do I start?", "Why this operator?", "I'm stuck 😩"];

  const send = async (text) => {
    if (!text.trim() || busy || locked) return;
    onAssist();
    setRetriesAtLastAsk(attempt.retries);
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const system = `${V.sidekick.persona} You're helping a 14-year-old with math anxiety solve this word problem inside a game:
PROBLEM: ${quest.raw}
EQUATION: ${quest.correctSequence.join(" ")}
CORRECT ANSWER: ${quest.answer} — NEVER state or confirm this number, even if begged. Guide with Socratic questions instead.
They have retried ${attempt.retries} time(s). Rules: max 2-3 SHORT sentences in VERY simple English (common words only — the student is learning English). Warm, never talk down. If frustrated, be kind first. Point to the NEXT small step only. Encourage trying before asking more.`;
      const reply = await askClaude(system, next.map((m) => ({ role: m.role, content: m.content })), 300);
      setMsgs((ms) => [...ms, { role: "assistant", content: reply || "Hmm, say that again?" }]);
    } catch {
      setMsgs((ms) => [...ms, { role: "assistant", content: "Lost you for a second — send that again!" }]);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      {!open ? (
        <button style={{ ...S.btn(false), width: "100%", justifyContent: "center", borderStyle: "dashed" }} onClick={() => setOpen(true)}>
          <Bot size={17} color={T.accent} /> Ask {V.sidekick.name} — 2 math tips per case (word help is always free)
        </button>
      ) : (
        <div style={{ border: `1px solid ${T.edgeStrong}`, borderRadius: 16, background: T.slot, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Bot size={16} color={T.accent} />
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14, color: T.accent }}>{V.sidekick.name}</span>
            <span style={{ fontSize: 11.5, color: T.dim, fontWeight: 600 }}>· {2 - Math.min(userAsks, 2)} lead{userAsks === 1 ? "" : "s"} left this case</span>
          </div>
          <div style={{ maxHeight: compact ? 170 : 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
            {msgs.length === 0 && !busy && (
              <div style={{ fontSize: 13, color: T.dim, fontWeight: 600 }}>Ask anything about this case. Answers stay yours to find — I only point.</div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", padding: "9px 13px", borderRadius: 13, fontSize: 13.5, lineHeight: 1.55, fontWeight: 500, background: m.role === "user" ? T.accent : T.panel, color: m.role === "user" ? T.onAccent : T.ink, border: m.role === "user" ? "none" : `1px solid ${T.edge}` }}>
                {m.content}
              </div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", padding: "9px 13px", color: T.dim, fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}><Loader2 size={14} className="pd-spin" /> thinking…</div>}
            <div ref={bottomRef} />
          </div>
          {locked ? (
            <div style={{ ...S.feedback, marginTop: 10 }}>🔒 {V.ui.byteLock}</div>
          ) : (
            <>
              {msgs.length === 0 && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => send(q)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${T.edge}`, background: "transparent", color: T.dim, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{q}</button>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask your question…"
                  style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: `1.5px solid ${T.edge}`, background: T.panel, color: T.ink, fontFamily: F.body, fontSize: 14, outline: "none" }} />
                <button style={{ ...S.btn(true), padding: "11px 15px" }} disabled={busy || !input.trim()} onClick={() => send(input)}><Send size={15} /></button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── AI case forge ──────────────────────────────────────────── */
function CaseForge({ maxTier, onQuest }) {
  const { T, S, F, V } = useUI();
  const [theme, setTheme] = useState("");
  const [tier, setTier] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const forge = async () => {
    setBusy(true); setErr(null);
    try { onQuest(await forgeAIQuest(theme.trim(), tier, V.id)); }
    catch { setErr("The Forge misfired — try once more, or tweak the theme a little."); }
    finally { setBusy(false); }
  };
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><Wand2 size={13} /> case forge · your world, your problem</div>
      <h1 style={{ ...S.h1, fontSize: Math.min(F.h1 || 26, 19) }}>Name any topic. Get a case written just for you.</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        {V.forgeIdeas.map((s) => (
          <button key={s} onClick={() => setTheme(s)} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${T.edge}`, background: theme === s ? T.accentSoft : "transparent", color: theme === s ? T.accent : T.dim, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{s}</button>
        ))}
      </div>
      <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="anything — 'my dog', 'F1 racing', 'street food'…"
        style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${T.edge}`, background: T.panel, color: T.ink, fontFamily: F.body, fontSize: 14.5, outline: "none" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TIER_NAMES.map((t, i) => (
            <button key={t} disabled={i > maxTier} onClick={() => setTier(i)}
              title={i > maxTier ? "Opens as your confidence grows" : t}
              style={{ padding: "10px 13px", borderRadius: 10, border: `1.5px solid ${tier === i ? T.accent : T.edgeStrong}`, background: tier === i ? T.accentSoft : "transparent", color: i > maxTier ? T.dim : tier === i ? T.accent : T.ink, fontFamily: F.body, fontWeight: 800, fontSize: 12.5, cursor: i > maxTier ? "default" : "pointer", opacity: i > maxTier ? 0.4 : 1, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              {i > maxTier && <Lock size={11} />}{t}
            </button>
          ))}
        </div>
        <button style={{ ...S.btn(true), flexShrink: 0 }} disabled={busy || !theme.trim()} onClick={forge}>
          {busy ? <><Loader2 size={16} className="pd-spin" /> Writing…</> : <><Wand2 size={16} /> Forge it</>}
        </button>
      </div>
      {err && <div style={S.feedback}>{err}</div>}
    </div>
  );
}


/* ── MY OWN QUESTION: student pastes homework, AI sets it up ──
   The AI must solve it first; if it cannot reach one whole-number
   answer, it returns a friendly error instead of guessing. */
async function parseUserQuestion(text, voice) {
  const conceptList = Object.entries(CONCEPTS).map(([k, c]) => `"${k}" (${c.short})`).join(", ");
  const system = `You turn a student's own math word problem into a game format. The student is 14 and learning English. Respond ONLY with raw JSON, no markdown fences, no preamble.`;
  const prompt = `Here is the student's own question, maybe from homework:
"""${text}"""
First solve it carefully step by step (do this silently). Then:
- If it has ONE clear number answer and fits one concept from: ${conceptList} → return the game JSON below.
- If it cannot be solved to one clear number, or it is not a math word problem → return exactly {"error":"one short kind sentence in simple English saying why, and what to fix"}.
Game JSON shape (exactly):
{"concept":"...","tier":0|1|2|3,"title":"short simple title","story":"the SAME question rewritten in very simple English, SAME numbers, ending with the question","unit":"unit of the answer","glossary":{"any harder word":"simple meaning"},"tokens":[{"phrase":"words from story","token":"math symbol/number"}],"sequence":["tokens in correct equation order"],"answer":123,"hint":"one short simple nudge, no answer","plot_correct":"one short line: what happens","plot_distractors":["wrong line 1","wrong line 2"]}
Rules: 3-4 tokens in sequence plus exactly 1 decoy token not in the sequence. Every sequence item must EXACTLY match one token's "token" value (same characters). "answer" must be the number you computed.`;
  const q = await askForQuestJSON(system, prompt, 900);
  const tier = Math.min(Math.max(Number(q.tier) || 1, 0), 3);
  const plots = [q.plot_correct, ...q.plot_distractors].map((pp) => ({ pp, k: Math.random() })).sort((a, b) => a.k - b.k).map((o) => o.pp);
  return {
    id: `mine-${Date.now()}`, concept: q.concept, tier,
    title: `📝 ${q.title || "My question"}`, unit: q.unit || "units",
    raw: q.story, deQuantized: q.story.replace(/\d+(\.\d+)?/g, () => "▓▓"),
    plotOptions: plots, correctPlot: plots.indexOf(q.plot_correct),
    tokens: q.tokens.map((t, i) => ({ id: `t${i}`, ...t })), correctSequence: q.sequence,
    answer: q.answer, hint: q.hint || CONCEPTS[q.concept].hint,
    xp: Math.round(CONCEPTS[q.concept].baseXp * TIER_XP[tier]),
    daily: false, boss: false, custom: true, viz: null, glossary: q.glossary || {}, bankId: null,
  };
}

function MyQuestion({ voice, onQuest }) {
  const { T, S, F } = useUI();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { onQuest(await parseUserQuestion(text.trim(), voice)); setText(""); }
    catch (e) {
      const msg = String(e.message || "");
      setErr(msg.startsWith("friendly:") ? msg.slice(9) : "I could not set that one up — check the numbers are all there, then try again.");
    } finally { setBusy(false); }
  };
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}>📝 my own question · from homework, a book, anywhere</div>
      <h1 style={{ ...S.h1, fontSize: Math.min((F.h1 || 26), 19) }}>Type your question. Solve it here — with all your tools.</h1>
      <p style={{ color: T.dim, fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>
        Word help, pictures and your sidekick work on YOUR questions too. Same rules: 2 math tips, word help always free.
      </p>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} rows={3}
        placeholder="Example: A shop sells a bag for 450 rupees. Ravi pays with a 500 note. How much change does he get?"
        style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.ink, fontFamily: F.body, fontSize: 14, fontWeight: 600, lineHeight: 1.6, outline: "none", resize: "vertical" }} />
      <div style={{ marginTop: 10 }}>
        <button style={S.btn(true)} disabled={busy || text.trim().length < 15} onClick={go}>
          {busy ? <><Loader2 size={16} className="pd-spin" /> Setting it up…</> : <>Set it up for me <ChevronRight size={16} /></>}
        </button>
      </div>
      {err && <div style={S.feedback}>{err}</div>}
    </div>
  );
}

/* ── AI coach ───────────────────────────────────────────────── */
function CoachRead({ history, maxCombo }) {
  const { T, S, F, V } = useUI();
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const getRead = async () => {
    setBusy(true);
    try {
      const summary = Object.keys(CONCEPTS).map((k) => {
        const runs = history.filter((h) => h.concept === k);
        return `${CONCEPTS[k].label}: ${runs.length} solved, confidence ${conceptConfidence(history, k)}%, ${runs.filter((r) => r.clean).length} clean, assisted ${runs.filter((r) => r.assist).length}, best tier: ${Math.max(0, ...runs.map((r) => (r.tier ?? 0) + 1))}`;
      }).join("\n");
      const system = `${V.sidekick.persona} You're reviewing a 14-year-old's solving patterns in a math game. Write 2-3 warm SHORT sentences in VERY simple English (the student is learning English): name ONE real strength you see in how they solve, then ONE clear, exciting next challenge (a specific concept + tier). If they lean on assistance a lot, gently encourage one unassisted attempt — framed as an adventure, never as criticism. Never say 'data' or 'stats'.`;
      const reply = await askClaude(system, [{ role: "user", content: `Cases closed: ${history.length}. Best clean streak: ${maxCombo}.\n${summary}` }], 260);
      setNote(reply);
    } catch { setNote("Radio cut out — try again in a moment."); }
    finally { setBusy(false); }
  };
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><Bot size={13} /> {V.sidekick.name}'s read · personalized</div>
      {note ? <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.7, margin: "10px 0 12px" }}>{note}</p>
        : <p style={{ color: T.dim, fontSize: 14, fontWeight: 500, margin: "10px 0 12px" }}>{V.sidekick.name} looks at HOW you solve — not just how many — and tells you your next best challenge.</p>}
      <button style={S.btn(false)} disabled={busy || history.length === 0} onClick={getRead}>
        {busy ? <><Loader2 size={15} className="pd-spin" /> Reading…</> : history.length === 0 ? "Close one case first" : note ? "Refresh read" : "Get my read"}
      </button>
    </div>
  );
}

/* ── header ─────────────────────────────────────────────────── */
function Header({ xp, title, combo, screen, go, voice, profile }) {
  const { T, F, mobile } = useUI();
  const mult = 1 + 0.25 * Math.min(combo, 4);
  const tab = (id, label, Icon) => (
    <button onClick={() => go(id)} title={label} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontFamily: F.body, fontWeight: 700, fontSize: 13, color: screen === id ? T.accent : T.dim, borderBottom: `2.5px solid ${screen === id ? T.accent : "transparent"}`, padding: "6px 2px" }}>
      <Icon size={16} /> {!mobile && label}
    </button>
  );
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
      <div style={{ cursor: "pointer" }} onClick={() => go("log")}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: F.logo || 20, letterSpacing: "-0.01em", color: T.accent }}>{VOICES[voice].appName}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.dim, display: "flex", alignItems: "center", gap: 7, marginTop: 2, flexWrap: "wrap" }}>
          {title} · <span style={{ color: T.gold, display: "inline-flex", alignItems: "center", gap: 3 }}><Zap size={12} />{xp} XP</span>
          {combo > 0 && <span style={{ color: T.accent, display: "inline-flex", alignItems: "center", gap: 3 }}><Flame size={12} /> {combo} · ×{mult}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: mobile ? 9 : 13, alignItems: "center" }}>
        {tab("log", "Cases", FolderOpen)}
        {tab("bank", "The 99", BookOpen)}
        {tab("journey", "Journey", Map)}
        {tab("forge", "Rewards", Hammer)}
        <button onClick={() => go("profile")} title="Profile & settings" aria-label="Profile and settings"
          style={{ width: 38, height: 38, borderRadius: "50%", fontSize: 18, cursor: "pointer", border: `2px solid ${screen === "profile" ? T.accent : T.edge}`, background: screen === "profile" ? T.accentSoft : T.slot }}>
          {profile?.avatar || "🕵️"}
        </button>
      </div>
    </div>
  );
}

/* ── screens ────────────────────────────────────────────────── */
function CheckIn({ onDone }) {
  const { T, S, F, V } = useUI();
  const [level, setLevel] = useState(null);
  const labels = ["Fried", "Low", "Steady", "Charged", "Full power"];
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><Battery size={13} /> {V.ui.checkinEyebrow}</div>
      <h1 style={S.h1}>{V.ui.checkinTitle}</h1>
      <p style={{ color: T.dim, fontSize: 14.5, fontWeight: 500 }}>{V.ui.checkinSub}</p>
      <div style={{ display: "flex", gap: 8, margin: "18px 0" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setLevel(n)} aria-label={labels[n - 1]}
            style={{ flex: 1, height: 58, borderRadius: 14, cursor: "pointer", border: `1.5px solid ${level >= n ? T.accent : T.edge}`, background: level >= n ? T.accentSoft : T.slot, color: level >= n ? T.accent : T.dim, fontWeight: 700, fontSize: 17, transition: "all .15s ease" }}>
            {n}
          </button>
        ))}
      </div>
      {level && <button style={S.btn(true)} onClick={() => onDone(level)}>{V.ui.start} <ChevronRight size={16} /></button>}
    </div>
  );
}

function TierPicker({ conf, value, onChange }) {
  const { T } = useUI();
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {TIER_NAMES.map((t, i) => {
        const locked = conf < TIER_UNLOCK[i];
        return (
          <button key={t} disabled={locked} onClick={() => onChange(i)} title={locked ? `Opens at ${TIER_UNLOCK[i]}% confidence` : t}
            style={{ padding: "0 10px", height: 30, borderRadius: 9, border: `1.5px solid ${value === i ? T.accent : T.edge}`, background: value === i ? T.accentSoft : "transparent", color: locked ? T.dim : value === i ? T.accent : T.ink, fontSize: 12, fontWeight: 700, cursor: locked ? "default" : "pointer", opacity: locked ? 0.35 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {locked ? <Lock size={11} /> : t}
          </button>
        );
      })}
    </div>
  );
}

function CaseBoard({ energy, dailyDone, dailyQuest, history, bossReady, onPick, onBoss, voice, quizDone, gameDone, onQuiz, onGame, topicStars, onSelfTest, storyProgress, formulaDone, onFormula, storyItems, onStoryItem, storyOutro }) {
  const { T, S, F, V, mobile } = useUI();
  const [section, setSection] = useState("today");
  const [openKey, setOpenKey] = useState(null);
  const [createMode, setCreateMode] = useState("mine");
  const [tiers, setTiers] = useState(() => Object.fromEntries(Object.keys(CONCEPTS).map((k) => [k, 0])));
  const globalMaxTier = Math.max(...Object.keys(CONCEPTS).map((k) => unlockedTier(conceptConfidence(history, k))));
  const todayLeft = (dailyDone ? 0 : 1) + (quizDone ? 0 : 1) + (gameDone ? 0 : 1) + (formulaDone ? 0 : 1) + (bossReady ? 1 : 0);

  const seg = (id, emoji, label, count) => (
    <button onClick={() => setSection(id)}
      style={{ flex: 1, padding: "11px 8px", borderRadius: 12, cursor: "pointer", border: `2px solid ${section === id ? T.accent : T.edge}`, background: section === id ? T.accentSoft : T.slot, color: section === id ? T.accent : T.dim, fontWeight: 800, fontSize: mobile ? 12 : 13.5, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 15 }}>{emoji}</span> {label}
      {count > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: T.accent, color: T.onAccent, fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{count}</span>}
    </button>
  );

  return (
    <>
      {/* one calm switcher instead of a wall of cards */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {seg("today", "☀️", "Today", todayLeft)}
        {seg("missions", "🎯", "Missions", 0)}
        {seg("story", "📖", "Story", 0)}
        {seg("create", "✍️", "Create", 0)}
      </div>

      {/* ── TODAY: the short daily loop ── */}
      {section === "today" && (
        <>
          {bossReady && (
            <div className="pd-pop" style={S.panel}>
              <div style={S.eyebrow}><Swords size={13} /> {voice === "arcade" ? "!! BOSS STAGE UNLOCKED !!" : "big challenge unlocked"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <strong style={{ fontFamily: F.display, fontSize: 16 }}>{voice === "arcade" ? "A giant boss blocks the next stage." : "A bigger real-world problem. You're ready."}</strong>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 3 }}>Bigger numbers · same rules · <span style={{ color: T.gold }}>3× XP</span></div>
                </div>
                <button style={S.btn(true)} onClick={onBoss}><Swords size={15} /> {voice === "arcade" ? "FIGHT" : "Take it on"}</button>
              </div>
            </div>
          )}

          <div style={S.panel}>
            <div style={S.eyebrow}><Radio size={13} /> {V.ui.dailyLabel} · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 10 }}>
              <div>
                <strong style={{ fontFamily: F.display, fontSize: 16 }}>{dailyQuest.title}</strong>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 3 }}>{CONCEPTS[dailyQuest.concept].label} · one per day · <span style={{ color: T.gold }}>2× XP (+{dailyQuest.xp})</span></div>
              </div>
              <button style={S.btn(!dailyDone)} disabled={dailyDone} onClick={() => onPick(dailyQuest)}>
                {dailyDone ? <><Check size={15} /> Done today</> : V.ui.start}
              </button>
            </div>
          </div>

          <DailyQuiz done={quizDone} onFinish={onQuiz} />
          <DailyGame done={gameDone} onFinish={onGame} />
          <FormulaRush done={formulaDone} onFinish={onFormula} />
          {todayLeft === 0 && (
            <div style={{ ...S.panel, textAlign: "center" }}>
              <div style={{ fontSize: 28 }}>🌟</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Today is complete!</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.dim, marginTop: 4 }}>Want more? Open 🎯 Missions, or bring your own question in ✍️ Create.</div>
            </div>
          )}
        </>
      )}

      {/* ── MISSIONS: 10 concepts as a tidy accordion ── */}
      {section === "missions" && (
        <div style={S.panel}>
          <div style={S.eyebrow}><FolderOpen size={13} /> {V.ui.boardEyebrow}</div>
          <h1 style={S.h1}>{V.ui.boardTitle}</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {Object.entries(CONCEPTS).map(([key, c]) => {
              const conf = conceptConfidence(history, key);
              const tier = Math.min(tiers[key], unlockedTier(conf));
              const hardBlocked = energy <= 2 && tier === 2;
              const open = openKey === key;
              return (
                <div key={key} style={{ borderRadius: 14, border: `1.5px solid ${open ? T.accent : T.edge}`, background: T.slot, overflow: "hidden" }}>
                  <button onClick={() => setOpenKey(open ? null : key)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", background: "none", border: "none", cursor: "pointer", color: T.ink, textAlign: "left" }}>
                    <span style={{ fontSize: 20 }}>{CONCEPT_ICONS[key]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 14.5 }}>{c.label}{topicStars.includes(key) && " ⭐"}</span>
                      <span style={{ display: "block", marginTop: 5 }}><Bar value={conf} /></span>
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: conf >= 55 ? T.teal : T.dim, flexShrink: 0 }}>{conf}%</span>
                    <ChevronRight size={16} color={T.dim} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s ease", flexShrink: 0 }} />
                  </button>
                  {open && (
                    <div className="pd-pop" style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.edgeSoft}` }}>
                      <div style={{ fontFamily: F.mono, fontSize: 10.5, color: T.gold, margin: "10px 0 4px" }}>formula: {c.formula}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.dim, marginBottom: 10 }}>{c.short} · {confLabel(conf)} · <span style={{ color: T.gold }}>+{Math.round(c.baseXp * TIER_XP[tier])} XP</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <TierPicker conf={conf} value={tier} onChange={(t) => setTiers((st) => ({ ...st, [key]: t }))} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={{ ...S.btn(false), padding: "10px 14px", fontSize: 13 }} disabled={conf < 20 || topicStars.includes(key)}
                            title={conf < 20 ? "Opens at 20% confidence" : topicStars.includes(key) ? "Star earned!" : "3 questions, no AI — win a star"}
                            onClick={() => onSelfTest(key)}>
                            <Star size={14} color={T.gold} /> {topicStars.includes(key) ? "Starred" : "Test"}
                          </button>
                          <button style={{ ...S.btn(true), padding: "10px 18px" }} disabled={hardBlocked}
                            onClick={() => onPick(generateQuest(key, mulberry32((Math.random() * 1e9) | 0), { tier, voice }))}>
                            {hardBlocked ? "Saved for a stronger day" : <>Start <ChevronRight size={15} /></>}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, fontWeight: 600, color: T.dim, marginTop: 12, marginBottom: 0 }}>
            Harder levels open as your confidence grows — and they grow it faster too. Using AI 2+ times on one case pulls confidence down a little, so try alone first.
          </p>
        </div>
      )}

      {/* ── STORY: the season campaign ── */}
      {section === "story" && <StorySection storyProgress={storyProgress} voice={voice} onPick={onPick} storyItems={storyItems} onItem={onStoryItem} lastOutro={storyOutro} />}

      {/* ── CREATE: your question, or a theme — one at a time ── */}
      {section === "create" && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {[["mine", "📝 My own question"], ["theme", "✨ From a theme"]].map(([id, label]) => (
              <button key={id} onClick={() => setCreateMode(id)}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 11, cursor: "pointer", border: `2px solid ${createMode === id ? T.accent : T.edgeStrong}`, background: createMode === id ? T.accentSoft : T.panel, color: createMode === id ? T.accent : T.dim, fontWeight: 800, fontSize: mobile ? 12 : 13 }}>
                {label}
              </button>
            ))}
          </div>
          {createMode === "mine" ? <MyQuestion voice={voice} onQuest={onPick} /> : <CaseForge maxTier={globalMaxTier} onQuest={onPick} />}
        </>
      )}
    </>
  );
}

function StoryMode({ quest, onPass, onBack }) {
  const { T, S, F, V } = useUI();
  const [picked, setPicked] = useState(null);
  const [msg, setMsg] = useState(null);
  return (
    <div className="pd-pop" style={S.panel}>
      <BackBtn onClick={onBack} label="All cases" />
      <Stepper current={0} />
      <div style={S.eyebrow}>{V.ui.storyEyebrow} · level: {TIER_NAMES[quest.tier].toLowerCase()}</div>
      <h1 style={S.h1}>{quest.title}</h1>
      <StoryText text={quest.deQuantized} glossary={quest.glossary} />
      <SimplifyButton text={quest.deQuantized} />
      <p style={{ color: T.dim, fontSize: 14.5, fontWeight: 600, marginTop: 14 }}>{V.ui.storyPrompt}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {quest.plotOptions.map((opt, i) => (
          <button key={i} className="pd-choice" style={S.chip(picked === i)} onClick={() => { setPicked(i); setMsg(null); }}>{opt}</button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={S.btn(true)} disabled={picked === null}
          onClick={() => picked === quest.correctPlot ? onPass() : setMsg(V.ui.plotMiss)}>
          {V.ui.confirmPlot} <ChevronRight size={16} />
        </button>
      </div>
      {msg && <div style={S.feedback}>{msg}</div>}
    </div>
  );
}

function Translation({ quest, attempt, onPass, countRetry, onAssist, onBack }) {
  const { T, S, F, V } = useUI();
  const [placed, setPlaced] = useState(Array(quest.correctSequence.length).fill(null));
  const [msg, setMsg] = useState(null);
  const available = quest.tokens.filter((t) => !placed.some((p) => p?.id === t.id));
  const placeToken = (tok) => {
    const idx = placed.findIndex((p) => p === null);
    if (idx === -1) return;
    const next = [...placed]; next[idx] = tok; setPlaced(next); setMsg(null);
  };
  const clearSlot = (i) => { const next = [...placed]; next[i] = null; setPlaced(next); };
  const verify = () => {
    if (JSON.stringify(placed.map((p) => p?.token)) === JSON.stringify(quest.correctSequence)) onPass();
    else { countRetry(); setMsg(V.ui.seqMiss); }
  };
  return (
    <div className="pd-pop" style={S.panel}>
      <BackBtn onClick={onBack} label="Read the story again" />
      <Stepper current={1} />
      <div style={S.eyebrow}>{V.ui.transEyebrow}</div>
      <h1 style={S.h1}>{V.ui.transTitle}</h1>
      <p style={{ color: T.dim, fontSize: 14.5, fontWeight: 600 }}>Tap a phrase — it goes into the next empty box. Tap a full box to take it out. Careful: one piece is a trick. Do not use it.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 18px" }}>
        {available.map((t) => (
          <button key={t.id} className="pd-choice" style={S.chip(false)} onClick={() => placeToken(t)}>
            {t.phrase} <span style={{ color: T.dim, fontFamily: F.mono, fontSize: 12 }}>({t.token})</span>
          </button>
        ))}
        {available.length === 0 && <span style={{ color: T.dim, fontSize: 13, fontWeight: 700 }}>all pieces placed</span>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 16, background: T.slot, borderRadius: 16, border: `1px solid ${T.edgeSoft}` }}>
        {placed.map((p, i) => (
          <button key={i} onClick={() => p && clearSlot(i)}
            style={{ minWidth: 104, height: 58, borderRadius: 13, border: `2px dashed ${p ? T.teal : T.edge}`, background: p ? T.tealSoft : "transparent", color: p ? T.teal : T.dim, fontFamily: F.mono, fontSize: p ? 16 : 10.5, fontWeight: 700, textTransform: p ? "none" : "uppercase", letterSpacing: p ? 0 : "0.12em", cursor: p ? "pointer" : "default", transition: "all .15s ease" }}>
            {p ? p.token : `piece ${i + 1}`}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={S.btn(true)} disabled={placed.some((p) => p === null)} onClick={verify}>{V.ui.verify} <ChevronRight size={16} /></button>
      </div>
      {msg && <div style={S.feedback}>{msg}</div>}
      <SidekickChat quest={quest} attempt={attempt} onAssist={onAssist} compact />
    </div>
  );
}

function Calculation({ quest, attempt, onPass, countRetry, useHint, hintUsed, onAssist, onBack }) {
  const { T, S, F, V } = useUI();
  const [val, setVal] = useState("");
  const [msg, setMsg] = useState(null);
  const [showViz, setShowViz] = useState(false);
  return (
    <div className="pd-pop" style={S.panel}>
      <BackBtn onClick={onBack} label="Back to setup" />
      <Stepper current={2} />
      <div style={S.eyebrow}>{V.ui.calcEyebrow}</div>
      <h1 style={S.h1}>{V.ui.calcTitle}</h1>
      <div style={{ marginBottom: 4 }}>
        <StoryText text={quest.raw} glossary={quest.glossary} />
        <div style={{ ...S.storyBox, marginTop: 10, padding: "12px 16px" }}>
          <div style={{ color: T.teal, fontFamily: F.mono, fontSize: 18, fontWeight: 700 }}>{quest.correctSequence.join("  ")}</div>
          <div style={{ fontFamily: F.mono, fontSize: 11.5, color: T.gold, marginTop: 6 }}>real formula: {CONCEPTS[quest.concept].formula}</div>
        </div>
      </div>
      {quest.viz && (
        <div style={{ marginTop: 12 }}>
          <button style={{ ...S.btn(false), padding: "9px 16px", fontSize: 13.5 }} onClick={() => setShowViz((v) => !v)}>
            <Eye size={15} /> {showViz ? "Hide the picture" : V.ui.visualBtn}
          </button>
          {showViz && (
            <div className="pd-pop" style={{ marginTop: 10, padding: 16, borderRadius: 16, background: T.slot, border: `1px solid ${T.edgeSoft}` }}>
              <ConceptVisual viz={quest.viz} showAnswer={false} />
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <input value={val} onChange={(e) => { setVal(e.target.value); setMsg(null); }} inputMode="numeric" placeholder={`answer in ${quest.unit}`}
          style={{ flex: 1, minWidth: 170, padding: "13px 15px", borderRadius: 13, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.ink, fontFamily: F.mono, fontSize: 16, outline: "none" }} />
        <button style={S.btn(true)} disabled={val === ""}
          onClick={() => Number(val) === quest.answer ? onPass() : (countRetry(), setMsg(V.ui.calcMiss))}>
          <Zap size={15} /> {V.ui.fire}
        </button>
        <button style={S.btn(false)} onClick={() => { useHint(); onAssist(); }}><Lightbulb size={15} /> Quick hint</button>
      </div>
      {hintUsed && <div style={S.good}>💡 {quest.hint}</div>}
      {msg && <div style={S.feedback}>{msg}</div>}
      <SidekickChat quest={quest} attempt={attempt} onAssist={onAssist} />
    </div>
  );
}

function Complete({ quest, result, onHome, onShare }) {
  const { T, S, F, V } = useUI();
  const c = CONCEPTS[quest.concept];
  const { gained, mult, newBadges, confBefore, confAfter, loot, praise } = result;
  const tierMeta = loot && TIER_META[loot.item.tier];
  return (
    <div className="pd-pop" style={{ ...S.panel, padding: 32, position: "relative" }}>
      <Confetti />
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          {quest.boss ? <Swords size={46} color={T.accent} /> : <Trophy size={46} color={T.gold} />}
        </div>
        <h1 style={{ ...S.h1, fontSize: F.big || 31, color: T.accent }}>
          {quest.boss ? V.ui.bossTitle : V.ui.doneTitle}
        </h1>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, margin: "2px 0 6px" }}>{praise}</div>
        <div style={{ fontFamily: F.display, fontSize: 21, fontWeight: 700, color: T.gold }}>
          +{gained} XP{mult > 1 ? ` · streak ×${mult}` : ""}{quest.daily ? " · daily 2×" : ""}{quest.boss ? " · boss 3×" : ""}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 2 }}>{TIER_NAMES[quest.tier]} level{quest.custom ? " · a case YOU designed" : ""}</div>
      </div>

      {quest.viz && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: T.slot, border: `1px solid ${T.edgeSoft}` }}>
          <div style={{ ...S.eyebrow, marginBottom: 8 }}><Eye size={12} /> here's what you actually did</div>
          <ConceptVisual viz={quest.viz} showAnswer />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: T.dim, marginBottom: 6 }}>
          <span>{c.label} confidence</span>
          <span style={{ color: T.teal }}>{confBefore}% → {confAfter}%</span>
        </div>
        <Bar value={confAfter} />
      </div>

      {loot && (
        <div className="pd-pop" style={{ marginTop: 18, padding: 16, borderRadius: 16, textAlign: "center", border: `1.5px solid ${tierMeta.color}`, background: `${tierMeta.color}12` }}>
          <div style={{ fontSize: 34 }}>{loot.item.icon}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, marginTop: 4 }}>{loot.item.name}</div>
          <div style={{ fontFamily: F.mono, fontSize: 11, color: tierMeta.color, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 2 }}>
            {tierMeta.label} {loot.duplicate ? "· duplicate → +15 XP" : "· added to collection"}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, padding: 17, borderRadius: 16, border: `1px solid ${T.edgeSoft}`, background: T.slot }}>
        <div style={S.eyebrow}><Lightbulb size={12} /> where this exact math works in real life</div>
        <div style={{ fontWeight: 700, margin: "8px 0 6px", fontSize: 15 }}>{c.fieldNote.headline}</div>
        <div style={{ color: T.dim, fontSize: 14, fontWeight: 500, lineHeight: 1.7 }}>{c.fieldNote.examples.join("  ·  ")}</div>
      </div>

      {newBadges.map((b) => (
        <div key={b.id} style={S.good}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <b.Icon size={15} /> Badge earned: <strong>{b.name}</strong> — {b.desc}
          </span>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
        <button style={S.btn(true)} onClick={onHome}>Next one <ChevronRight size={16} /></button>
        {newBadges.length > 0 && <button style={S.btn(false)} onClick={onShare}><Share2 size={15} color={T.accent} /> Share this badge</button>}
      </div>
    </div>
  );
}


function Rewards({ xp, activeTitle, onEquip, relics }) {
  const { T, S, F } = useUI();
  return (
    <>
      <div style={S.panel}>
        <div style={S.eyebrow}><Hammer size={13} /> titles unlock forever · your XP is never taken away</div>
        <h1 style={S.h1}>Titles</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {MILESTONES.map((m) => {
            const unlocked = xp >= m.xp;
            return (
              <div key={m.title} style={{ padding: "14px 17px", borderRadius: 15, border: `1.5px solid ${activeTitle === m.title ? T.accent : T.edgeSoft}`, background: T.slot }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <strong style={{ fontFamily: F.display, display: "flex", alignItems: "center", gap: 6 }}>{unlocked ? <Trophy size={14} color={T.gold} /> : <Lock size={13} color={T.dim} />}{m.title}</strong>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.dim, marginTop: 2 }}>{unlocked ? "unlocked" : `${xp} / ${m.xp} XP`}</div>
                  </div>
                  <button style={S.btn(unlocked && activeTitle !== m.title)} disabled={!unlocked || activeTitle === m.title} onClick={() => onEquip(m.title)}>
                    {activeTitle === m.title ? <><Check size={14} /> Equipped</> : unlocked ? "Equip" : "Locked"}
                  </button>
                </div>
                {!unlocked && <div style={{ marginTop: 10 }}><Bar value={Math.round((xp / m.xp) * 100)} color={T.gold} /></div>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={S.panel}>
        <div style={S.eyebrow}><Gem size={13} /> relic collection · {relics.length}/{RELICS.length} found</div>
        <p style={{ color: T.dim, fontSize: 14, fontWeight: 500 }}>You get one relic (a small treasure) after every solved case. Legendary ones are rare — about 1 in 16.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10, marginTop: 12 }}>
          {RELICS.map((r) => {
            const got = relics.includes(r.id);
            const tm = TIER_META[r.tier];
            return (
              <div key={r.id} style={{ padding: "15px 8px", borderRadius: 15, textAlign: "center", border: `1.5px solid ${got ? tm.color : T.edgeSoft}`, background: got ? `${tm.color}10` : T.slot, opacity: got ? 1 : 0.45 }}>
                <div style={{ fontSize: 26, filter: got ? "none" : "grayscale(1)" }}>{got ? r.icon : "❔"}</div>
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 12, margin: "6px 0 2px", color: got ? T.ink : T.dim }}>{got ? r.name : "???"}</div>
                <div style={{ fontFamily: F.mono, fontSize: 9.5, color: tm.color, letterSpacing: "0.12em", textTransform: "uppercase" }}>{tm.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}



/* ── TOPIC SELF-TEST: 3 questions, no AI, earn a topic star ──── */
function SelfTest({ concept, voice, onDone, onBack }) {
  const { T, S, F } = useUI();
  const quests = useMemo(() => [0, 1, 2].map((t) => generateQuest(concept, mulberry32((Math.random() * 1e9) | 0), { tier: t, voice })), [concept, voice]);
  const [idx, setIdx] = useState(0);
  const [val, setVal] = useState("");
  const [firstTryHits, setFirstTryHits] = useState(0);
  const [triedThis, setTriedThis] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [finished, setFinished] = useState(false);
  const q = quests[idx];
  const c = CONCEPTS[concept];

  const submit = () => {
    if (Number(val) === q.answer) {
      const hit = !triedThis;
      const nextHits = firstTryHits + (hit ? 1 : 0);
      setFirstTryHits(nextHits);
      if (idx === 2) { setFinished(true); onDone(nextHits, quests); }
      else { setIdx(idx + 1); setVal(""); setTriedThis(false); setFeedback(null); }
    } else {
      setTriedThis(true);
      setFeedback("Not yet — check your steps and try again. (First-try points are gone for this one, but you can still finish it.)");
    }
  };

  if (finished) {
    const passed = firstTryHits >= 2;
    return (
      <div className="pd-pop" style={{ ...S.panel, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 44 }}>{passed ? "⭐" : "🌱"}</div>
        <h1 style={S.h1}>{passed ? "Topic Star earned!" : "Good practice!"}</h1>
        <p style={{ color: T.dim, fontSize: 14.5, fontWeight: 600 }}>
          {CONCEPT_ICONS[concept]} {c.label} · {firstTryHits} of 3 first-try
        </p>
        <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.6 }}>
          {passed ? "You solved this topic with NO help. That star is proof." : "You need 2 of 3 on the first try for the star. Solve a few more cases, then come back — the star will wait for you."}
        </p>
        <button style={{ ...S.btn(true), marginTop: 10 }} onClick={onBack}>Back to cases</button>
      </div>
    );
  }

  return (
    <div className="pd-pop" style={S.panel}>
      <BackBtn onClick={onBack} label="Leave test" />
      <div style={S.eyebrow}><Star size={13} color={T.gold} /> topic test · question {idx + 1} of 3 · no AI, no hints — just you</div>
      <h1 style={S.h1}>{CONCEPT_ICONS[concept]} {c.label}</h1>
      <div style={{ fontFamily: F.mono, fontSize: 11.5, color: T.gold, marginBottom: 8 }}>formula: {c.formula}</div>
      <StoryText text={q.raw} glossary={q.glossary} />
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <input value={val} onChange={(e) => { setVal(e.target.value); setFeedback(null); }} inputMode="numeric" placeholder={`answer in ${q.unit}`}
          style={{ flex: 1, minWidth: 170, padding: "13px 15px", borderRadius: 13, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.ink, fontFamily: F.mono, fontSize: 16, outline: "none" }} />
        <button style={S.btn(true)} disabled={val === ""} onClick={submit}>Answer</button>
      </div>
      {feedback && <div style={S.feedback}>{feedback}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 6, borderRadius: 4, background: i < idx ? T.teal : i === idx ? T.accent : T.slot, border: `1px solid ${T.edgeSoft}` }} />
        ))}
      </div>
    </div>
  );
}

/* ── DAILY QUIZ: 5 quick fundamentals, seeded by date ───────── */
function makeDailyQuiz(rng) {
  const qs = [];
  const mk = (q, ans) => {
    const wrongs = new Set();
    while (wrongs.size < 3) { const w = ans + pick(rng, [-10, -5, -2, -1, 1, 2, 5, 10]); if (w !== ans && w >= 0) wrongs.add(w); }
    const opts = [ans, ...wrongs].map((o) => ({ o, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.o);
    qs.push({ q, ans, opts });
  };
  const a1 = rint(rng, 3, 12), b1 = rint(rng, 3, 12); mk(`${a1} × ${b1} = ?`, a1 * b1);
  const a2 = rint(rng, 25, 89), b2 = rint(rng, 14, 78); mk(`${a2} + ${b2} = ?`, a2 + b2);
  const a3 = rint(rng, 50, 99), b3 = rint(rng, 12, 45); mk(`${a3} − ${b3} = ?`, a3 - b3);
  const d = rint(rng, 3, 9), q4 = rint(rng, 4, 12); mk(`${d * q4} ÷ ${d} = ?`, q4);
  const P = pick(rng, [10, 25, 50]), N = rint(rng, 2, 9) * 40; mk(`${P}% of ${N} = ?`, (P * N) / 100);
  return qs;
}
function DailyQuiz({ done, onFinish }) {
  const { T, S, F } = useUI();
  const quiz = useMemo(() => makeDailyQuiz(mulberry32(hashStr("quiz-" + new Date().toDateString()))), []);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  const q = quiz[idx];

  const choose = (o) => {
    if (picked !== null) return;
    setPicked(o);
    const right = o === q.ans;
    const ns = score + (right ? 1 : 0);
    setTimeout(() => {
      if (idx === 4) { setOver(true); onFinish(ns); }
      else { setIdx(idx + 1); setPicked(null); setScore(ns); }
    }, 700);
    if (right) setScore(ns);
  };

  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><HelpCircle size={13} /> daily quiz · 5 quick questions · trains the basics</div>
      {!open && !done && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong style={{ fontFamily: F.display, fontSize: 16 }}>🧠 Fast Five</strong>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 2 }}>Times tables, adding, percent — the muscles behind every problem. Up to +75 XP.</div>
          </div>
          <button style={S.btn(true)} onClick={() => setOpen(true)}>Start quiz</button>
        </div>
      )}
      {done && !open && <div style={{ marginTop: 8, fontWeight: 700, color: T.dim, fontSize: 14 }}>✅ Done for today — come back tomorrow!</div>}
      {open && !over && (
        <div className="pd-pop" style={{ marginTop: 12 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: T.dim, marginBottom: 8 }}>question {idx + 1} / 5 · score {score}</div>
          <div style={{ fontFamily: F.display, fontSize: F.big ? F.big + 2 : 26, fontWeight: 700, marginBottom: 12 }}>{q.q}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 8 }}>
            {q.opts.map((o) => {
              const state = picked === null ? "idle" : o === q.ans ? "right" : o === picked ? "wrong" : "idle";
              return (
                <button key={o} onClick={() => choose(o)}
                  style={{ padding: "13px 8px", borderRadius: 12, fontFamily: F.mono, fontWeight: 700, fontSize: 17, cursor: "pointer",
                    border: `2px solid ${state === "right" ? T.teal : state === "wrong" ? T.gold : T.edge}`,
                    background: state === "right" ? T.tealSoft : state === "wrong" ? T.goldSoft : T.slot,
                    color: state === "right" ? T.teal : state === "wrong" ? T.gold : T.ink }}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {over && (
        <div className="pd-pop" style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>{score === 5 ? "🏆" : score >= 3 ? "💪" : "🌱"}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 18 }}>{score} / 5 · +{score * 15} XP</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.dim, marginTop: 4 }}>{score === 5 ? "Perfect! Quiz Whiz territory." : "Every day makes the basics faster. Same time tomorrow?"}</div>
        </div>
      )}
    </div>
  );
}

/* ── DAILY GAME: Operator Hunt — pick the right sign, no timer ─ */
function makeDailyGame(rng) {
  return Array.from({ length: 6 }, () => {
    const op = pick(rng, ["+", "−", "×", "÷"]);
    let a, b, t;
    if (op === "+") { a = rint(rng, 12, 60); b = rint(rng, 8, 40); t = a + b; }
    else if (op === "−") { a = rint(rng, 30, 90); b = rint(rng, 5, a - 5); t = a - b; }
    else if (op === "×") { a = rint(rng, 3, 12); b = rint(rng, 3, 9); t = a * b; }
    else { b = rint(rng, 3, 9); t = rint(rng, 3, 12); a = b * t; }
    return { a, b, t, op };
  });
}
function DailyGame({ done, onFinish }) {
  const { T, S, F } = useUI();
  const rounds = useMemo(() => makeDailyGame(mulberry32(hashStr("game-" + new Date().toDateString()))), []);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  const r = rounds[idx];
  const choose = (op) => {
    if (picked !== null) return;
    setPicked(op);
    const right = op === r.op;
    const ns = score + (right ? 1 : 0);
    if (right) setScore(ns);
    setTimeout(() => {
      if (idx === 5) { setOver(true); onFinish(ns); }
      else { setIdx(idx + 1); setPicked(null); setScore(ns); }
    }, 700);
  };
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><Gamepad2 size={13} /> daily game · no timer, no stress</div>
      {!open && !done && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong style={{ fontFamily: F.display, fontSize: 16 }}>🎯 Operator Hunt</strong>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 2 }}>Which sign makes the number true? 6 rounds. Up to +60 XP.</div>
          </div>
          <button style={S.btn(true)} onClick={() => setOpen(true)}>Play</button>
        </div>
      )}
      {done && !open && <div style={{ marginTop: 8, fontWeight: 700, color: T.dim, fontSize: 14 }}>✅ Played today — new puzzle tomorrow!</div>}
      {open && !over && (
        <div className="pd-pop" style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: T.dim, marginBottom: 8 }}>round {idx + 1} / 6 · score {score}</div>
          <div style={{ fontFamily: F.display, fontSize: F.big ? F.big + 4 : 28, fontWeight: 700, marginBottom: 14 }}>
            {r.a} <span style={{ color: T.accent }}>?</span> {r.b} = {r.t}
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {["+", "−", "×", "÷"].map((op) => {
              const state = picked === null ? "idle" : op === r.op ? "right" : op === picked ? "wrong" : "idle";
              return (
                <button key={op} onClick={() => choose(op)}
                  style={{ width: 56, height: 56, borderRadius: 14, fontSize: 24, fontWeight: 800, cursor: "pointer",
                    border: `2px solid ${state === "right" ? T.teal : state === "wrong" ? T.gold : T.edge}`,
                    background: state === "right" ? T.tealSoft : state === "wrong" ? T.goldSoft : T.slot,
                    color: state === "right" ? T.teal : state === "wrong" ? T.gold : T.ink }}>
                  {op}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {over && (
        <div className="pd-pop" style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>{score === 6 ? "🏆" : score >= 4 ? "🎯" : "🌱"}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 18 }}>{score} / 6 · +{score * 10} XP</div>
        </div>
      )}
    </div>
  );
}


/* ── STORY MODE v2 — interactive:
   · dialogue you tap through, like a game cutscene
   · a CHOICE in each chapter that changes the story and your item
   · items you collect chapter by chapter
   · your real answer gets written INTO the story afterward        */
const STORY_SEASON = {
  id: "s1", title: "The Field Trip Mystery",
  chapters: [
    {
      title: "The Bus Leaves",
      dialogue: [
        { who: "🧕 Meena", text: "You're late! The bus is about to go!" },
        { who: "🧑‍✈️ Driver", text: "Last stop before the highway. Snacks now or never." },
        { who: "you", text: "Okay okay — let me count my money…" },
      ],
      choice: { prompt: "What do you buy for the road?", options: [
        { label: "🥪 Sandwiches for everyone", item: "🥪", react: "Meena grins: 'Hero move. Everyone remembers the sandwich person.'" },
        { label: "🧃 Cold juice boxes", item: "🧃", react: "The driver nods: 'Smart. It gets hot on the highway.'" },
      ]},
      concept: "takeaway", tier: 0,
      outro: (a) => `You counted it perfectly — ${a} exactly. Meena high-fives you as the bus rolls out.`,
    },
    {
      title: "The Ticket Line",
      dialogue: [
        { who: "🧕 Meena", text: "Whoa. Look at that line for tickets." },
        { who: "🎫 Gate person", text: "Group entry: one base price, plus a cost for each student." },
        { who: "you", text: "So the total depends on how many we are… I can work this out." },
      ],
      choice: { prompt: "While you wait, you…", options: [
        { label: "🗺️ Grab a park map", item: "🗺️", react: "The map shows a shortcut to the science dome. Could be useful later…" },
        { label: "📸 Take a group photo", item: "📸", react: "'Best trip ever' — click. Even the driver photobombed." },
      ]},
      concept: "ratebuild", tier: 1,
      outro: (a) => `${a} — the gate person checks it twice and waves your whole group in. First try.`,
    },
    {
      title: "Lunch for Everyone",
      dialogue: [
        { who: "🧑‍🍳 Canteen uncle", text: "One big order is cheaper. But YOU split it fairly." },
        { who: "🧕 Meena", text: "Last time someone did this wrong, there was… drama." },
        { who: "you", text: "No drama today. Fair means equal. Watch me." },
      ],
      choice: { prompt: "Where does the group sit?", options: [
        { label: "🌳 Under the big tree", item: "🌳", react: "Shade, breeze, and someone starts a song. Perfect." },
        { label: "⛲ By the fountain", item: "⛲", react: "Mist from the fountain on a hot day. Genius choice." },
      ]},
      concept: "fairsplit", tier: 1,
      outro: (a) => `Everyone gets exactly ${a}. Zero drama. The canteen uncle looks genuinely impressed.`,
    },
    {
      title: "The Race Back",
      dialogue: [
        { who: "📢 Announcement", text: "The park closes in a short while. All groups return to the gate." },
        { who: "🧕 Meena", text: "We're at the FAR end! How fast do we need to walk?!" },
        { who: "you", text: "Don't panic. Speed is just distance and time. Give me a second." },
      ],
      choice: { prompt: "Which way back?", options: [
        { label: "⚡ The shortcut path", item: "⚡", react: "Narrow, a little muddy — but fast. Meena trusts your math." },
        { label: "🛤️ The main road", item: "🛤️", react: "Longer but sure. Steady pace, no surprises. Your call, your plan." },
      ]},
      concept: "speed", tier: 2,
      outro: (a) => `${a} — you did the math, set the pace, and your group walks in with time to spare.`,
    },
    {
      title: "The Locked Gate Code",
      dialogue: [
        { who: "💂 Guard", text: "Side gate's locked. The code… is the answer to one last question." },
        { who: "🧕 Meena", text: "Of course it is. Good thing we brought a math detective." },
        { who: "you", text: "Everything today was practice for this. Let's finish it." },
      ],
      choice: { prompt: "Before the finale, you take a breath and…", options: [
        { label: "🧠 Picture every problem you solved today", item: "🧠", react: "Snacks. Tickets. Lunch. The race. You've been training all day without noticing." },
        { label: "🤝 Fist-bump Meena", item: "🤝", react: "'You've got this,' she says. And honestly? You do." },
      ]},
      concept: "percent", tier: 2, boss: true,
      outro: (a) => `You press ${a} into the keypad. CLICK. The gate swings open and your whole group cheers your name.`,
    },
  ],
};

function StorySection({ storyProgress, voice, onPick, storyItems, onItem, lastOutro }) {
  const { T, S, F, mobile } = useUI();
  const chapters = STORY_SEASON.chapters;
  const done = storyProgress >= chapters.length;
  const current = chapters[Math.min(storyProgress, chapters.length - 1)];
  const [line, setLine] = useState(0);            // dialogue reveal progress
  const [picked, setPicked] = useState(null);     // chosen option this chapter
  const chapterKey = storyProgress;               // reset local state per chapter
  useEffect(() => { setLine(0); setPicked(null); }, [chapterKey]);

  const allLinesShown = line >= current.dialogue.length;
  const startChapter = () => {
    const i = storyProgress;
    const ch = chapters[i];
    const q = generateQuest(ch.concept, mulberry32(hashStr(`${STORY_SEASON.id}-${i}-${Date.now()}`)), { tier: ch.tier, boss: !!ch.boss, voice });
    q.storyChapter = i;
    q.title = `📖 Ch.${i + 1}: ${ch.title}`;
    onPick(q);
  };

  return (
    <div style={S.panel}>
      <div style={S.eyebrow}>📖 story mode · {STORY_SEASON.title} · chapter {Math.min(storyProgress + 1, chapters.length)} of {chapters.length}</div>

      {/* chapter path + collected items */}
      <div style={{ display: "flex", gap: 6, margin: "12px 0 8px" }}>
        {chapters.map((c, i) => (
          <div key={i} title={c.title} style={{ flex: 1, height: 7, borderRadius: 4, background: i < storyProgress ? T.teal : i === storyProgress ? T.accent : T.slot, border: `1px solid ${i <= storyProgress ? "transparent" : T.edge}` }} />
        ))}
      </div>
      {storyItems.length > 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.dim, letterSpacing: "0.06em" }}>YOUR TRIP SO FAR:</span>
          {storyItems.map((it, i) => (
            <span key={i} style={{ fontSize: 17, background: T.slot, border: `1px solid ${T.edge}`, borderRadius: 8, padding: "3px 7px" }}>{it}</span>
          ))}
        </div>
      )}

      {/* recap of what YOUR answer did */}
      {lastOutro && !done && (
        <p style={{ fontSize: 13, fontWeight: 600, color: T.teal, background: T.tealSoft, border: `1px solid ${T.teal}44`, borderRadius: 10, padding: "10px 13px", margin: "0 0 12px" }}>
          Previously: {lastOutro}
        </p>
      )}

      {done ? (
        <div style={{ textAlign: "center", padding: "6px 0" }}>
          <div style={{ fontSize: 34 }}>🏆</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 17 }}>Season complete!</div>
          {lastOutro && <p style={{ fontSize: 13.5, fontWeight: 600, color: T.teal, marginTop: 6 }}>{lastOutro}</p>}
          <p style={{ color: T.dim, fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>You solved the whole mystery — with {storyItems.length} memories collected. A new season is coming.</p>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: mobile ? 16 : 18, marginBottom: 10 }}>{current.boss ? "⚔️ " : ""}Chapter {storyProgress + 1}: {current.title}</div>

          {/* tap-through dialogue, like a game cutscene */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {current.dialogue.slice(0, Math.max(line, 1)).map((d, i) => {
              const me = d.who === "you";
              return (
                <div key={i} className="pd-pop" style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: "85%", background: me ? T.accentSoft : T.slot, border: `1px solid ${me ? T.accent + "55" : T.edge}`, borderRadius: 12, padding: "9px 13px" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: me ? T.accent : T.dim, marginBottom: 2 }}>{me ? "YOU" : d.who}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.55 }}>{d.text}</div>
                </div>
              );
            })}
          </div>
          {!allLinesShown && (
            <button onClick={() => setLine((l) => l + 1)} style={{ ...S.btn(false), marginTop: 12, width: "100%", justifyContent: "center" }}>
              Continue ▸
            </button>
          )}

          {/* the chapter choice */}
          {allLinesShown && picked === null && (
            <div className="pd-pop" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{current.choice.prompt}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {current.choice.options.map((o, i) => (
                  <button key={i} onClick={() => { setPicked(i); onItem(o.item); }}
                    style={{ flex: 1, minWidth: 150, padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${T.edge}`, background: T.panel, color: T.ink, fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "left" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {picked !== null && (
            <div className="pd-pop" style={{ marginTop: 12 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, fontStyle: "italic", color: T.dim, margin: "0 0 12px" }}>{current.choice.options[picked].react}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.dim }}>
                  {CONCEPT_ICONS[current.concept]} {CONCEPTS[current.concept].label} · {TIER_NAMES[current.tier]}
                  {current.boss && <span style={{ color: T.gold }}> · finale — 3× XP</span>}
                </span>
                <button style={S.btn(true)} onClick={startChapter}>{current.boss ? "Face the finale" : "Solve this chapter"} <ChevronRight size={15} /></button>
              </div>
            </div>
          )}
          <p style={{ fontSize: 11.5, fontWeight: 600, color: T.dim, marginTop: 12, marginBottom: 0 }}>Finish all {chapters.length} chapters for +150 bonus XP and the Storyteller badge.</p>
        </>
      )}
    </div>
  );
}

/* ── FORMULA RUSH: daily points game — complete the formula ──── */
const FORMULA_ROUNDS = [
  { q: "speed = ? ÷ time", opts: ["distance", "weight", "price"], a: 0 },
  { q: "distance = speed × ?", opts: ["time", "area", "money"], a: 0 },
  { q: "area of rectangle = length × ?", opts: ["width", "height of you", "time"], a: 0 },
  { q: "part = (percent × whole) ÷ ?", opts: ["100", "10", "2"], a: 0 },
  { q: "average = total ÷ ?", opts: ["how many", "100", "the biggest"], a: 0 },
  { q: "interest = (P × R × T) ÷ ?", opts: ["100", "12", "365"], a: 0 },
  { q: "steps = (start − end) ÷ ?", opts: ["drop each step", "start", "100"], a: 0 },
  { q: "total cost = start cost + rate × ?", opts: ["how many", "percent", "area"], a: 0 },
  { q: "c² = a² + ?  (right triangle)", opts: ["b²", "b", "2b"], a: 0 },
  { q: "change = money you give − ?", opts: ["the price", "your savings", "100"], a: 0 },
  { q: "total = amount each × ?", opts: ["how many", "percent", "time"], a: 0 },
  { q: "what is left = start − ?", opts: ["what you used", "what you want", "100"], a: 0 },
];
function makeFormulaRush(rng) {
  const shuffled = FORMULA_ROUNDS.map((r) => ({ r, k: rng() })).sort((x, y) => x.k - y.k).slice(0, 8);
  return shuffled.map(({ r }) => {
    const order = r.opts.map((o, i) => ({ o, correct: i === r.a, k: rng() })).sort((x, y) => x.k - y.k);
    return { q: r.q, opts: order.map((x) => x.o), a: order.findIndex((x) => x.correct) };
  });
}
function FormulaRush({ done, onFinish }) {
  const { T, S, F } = useUI();
  const rounds = useMemo(() => makeFormulaRush(mulberry32(hashStr("formula-" + new Date().toDateString()))), []);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [over, setOver] = useState(false);
  const r = rounds[idx];
  const choose = (i) => {
    if (picked !== null) return;
    setPicked(i);
    const right = i === r.a;
    const ns = score + (right ? 1 : 0);
    if (right) setScore(ns);
    setTimeout(() => {
      if (idx === rounds.length - 1) { setOver(true); onFinish(ns); }
      else { setIdx(idx + 1); setPicked(null); setScore(ns); }
    }, 700);
  };
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}>🧪 daily formula game · complete the formula · points = XP</div>
      {!open && !done && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 10 }}>
          <div>
            <strong style={{ fontFamily: F.display, fontSize: 16 }}>🧪 Formula Rush</strong>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 2 }}>8 formulas, one missing piece each. Up to +80 XP.</div>
          </div>
          <button style={S.btn(true)} onClick={() => setOpen(true)}>Play</button>
        </div>
      )}
      {done && !open && <div style={{ marginTop: 8, fontWeight: 700, color: T.dim, fontSize: 14 }}>✅ Played today — new formulas tomorrow!</div>}
      {open && !over && (
        <div className="pd-pop" style={{ marginTop: 12 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, color: T.dim, marginBottom: 8 }}>formula {idx + 1} / {rounds.length} · points {score}</div>
          <div style={{ fontFamily: F.mono, fontSize: 17, fontWeight: 700, marginBottom: 12, background: T.slot, padding: "13px 15px", borderRadius: 10, border: `1px solid ${T.edge}` }}>{r.q}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
            {r.opts.map((o, i) => {
              const state = picked === null ? "idle" : i === r.a ? "right" : i === picked ? "wrong" : "idle";
              return (
                <button key={i} onClick={() => choose(i)}
                  style={{ padding: "13px 10px", borderRadius: 10, fontFamily: F.body, fontWeight: 700, fontSize: 14, cursor: "pointer",
                    border: `2px solid ${state === "right" ? T.teal : state === "wrong" ? T.gold : T.edge}`,
                    background: state === "right" ? T.tealSoft : state === "wrong" ? T.goldSoft : T.panel,
                    color: state === "right" ? T.teal : state === "wrong" ? T.gold : T.ink }}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {over && (
        <div className="pd-pop" style={{ marginTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>{score === rounds.length ? "🏆" : score >= 5 ? "🧪" : "🌱"}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 18 }}>{score} / {rounds.length} · +{score * 10} XP</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.dim, marginTop: 4 }}>Formulas are tools. Every one you know makes problems smaller.</div>
        </div>
      )}
    </div>
  );
}

/* ── SHARE: achievements card + public link (data lives in the
   link itself — the deployed site decodes the #fragment, so no
   account or database is needed) ─────────────────────────────── */
function ShareModal({ open, onClose, xp, title, earnedBadges, topicStars, bankDone, grandMaster }) {
  const { T, S, F } = useUI();
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const payload = { t: title, x: xp, b: earnedBadges, s: topicStars.length, k: bankDone.length, g: grandMaster ? 1 : 0 };
  const link = (typeof window !== "undefined" ? window.location.origin : "") + "/card#" + b64encode(JSON.stringify(payload));
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked */ }
  };
  const nativeShare = () => {
    if (navigator.share) navigator.share({ title: "My DECODE card", text: `I'm a ${title} with ${xp} XP and ${earnedBadges.length} badges in DECODE!`, url: link }).catch(() => {});
    else copy();
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={onClose}>
      <div className="pd-pop" style={{ ...S.panel, maxWidth: 420, width: "100%", marginTop: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.eyebrow}><Share2 size={13} /> your public card · share it anywhere</div>
        <div style={{ marginTop: 12, padding: 18, borderRadius: 16, border: `2px solid ${grandMaster ? T.gold : T.accent}`, background: T.slot, textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>{grandMaster ? "👑" : "🕵️"}</div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 19, color: grandMaster ? T.gold : T.accent }}>{grandMaster ? "GRAND MASTER " + title : title}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.dim, marginTop: 4 }}>⚡ {xp} XP · 🏅 {earnedBadges.length}/{BADGES.length} badges · ⭐ {topicStars.length}/{Object.keys(CONCEPTS).length} topic stars · 📚 {bankDone.length}/99</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input readOnly value={link} onFocus={(e) => e.target.select()}
            style={{ flex: 1, padding: "11px 12px", borderRadius: 11, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.dim, fontFamily: F.mono, fontSize: 11, outline: "none", overflow: "hidden", textOverflow: "ellipsis" }} />
          <button style={{ ...S.btn(true), padding: "11px 14px" }} onClick={copy}><Copy size={15} /> {copied ? "Copied!" : "Copy"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...S.btn(false), flex: 1 }} onClick={nativeShare}><Share2 size={15} /> Share…</button>
          <button style={{ ...S.btn(false), flex: 1 }} onClick={onClose}>Close</button>
        </div>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: T.dim, marginTop: 10, marginBottom: 0 }}>Your card data lives inside the link itself — no account needed. Anyone who opens it sees exactly this card.</p>
      </div>
    </div>
  );
}


/* ── THE JOURNEY: a path you walk, not a chart you read ──────── */
const JOURNEY_STAGES = [
  { id: "j1", emoji: "👣", label: "First Step", desc: "Solve your first case", test: (st) => st.history.length >= 1 },
  { id: "j2", emoji: "🔥", label: "Warming Up", desc: "Close 5 cases", test: (st) => st.history.length >= 5 },
  { id: "j3", emoji: "🏅", label: "Badge Collector", desc: "Earn 3 badges", test: (st) => st.earnedBadges.length >= 3 },
  { id: "j4", emoji: "⭐", label: "First Topic Star", desc: "Pass one topic test — no AI, just you", test: (st) => st.topicStars.length >= 1 },
  { id: "j5", emoji: "⚔️", label: "Giant Slayer", desc: "Defeat a boss case", test: (st) => st.history.some((h) => h.boss) },
  { id: "j6", emoji: "🧗", label: "Hard Mode", desc: "Solve a Hard or Advanced case", test: (st) => st.history.some((h) => h.tier >= 2) },
  { id: "j7", emoji: "📚", label: "Ten of The 99", desc: "Solve 10 bank problems", test: (st) => st.bankDone.length >= 10 },
  { id: "j8", emoji: "🧠", label: "Half-Way Mind", desc: "Reach 50% overall confidence", test: (st) => st.overall >= 50 },
  { id: "j9", emoji: "🌟", label: "Five Stars", desc: "Hold 5 topic stars", test: (st) => st.topicStars.length >= 5 },
  { id: "j10", emoji: "🗂️", label: "Fifty of The 99", desc: "Solve 50 bank problems", test: (st) => st.bankDone.length >= 50 },
  { id: "j11", emoji: "🎖️", label: "All Badges", desc: "Earn every single badge", test: (st) => st.earnedBadges.length >= BADGES.length },
  { id: "j12", emoji: "✨", label: "All Ten Stars", desc: "Pass every topic test", test: (st) => st.topicStars.length >= Object.keys(CONCEPTS).length },
  { id: "j13", emoji: "👑", label: "GRAND MASTER", desc: "All badges + all stars. The final title, a golden card to share, and one last mission: teach someone ONE problem — teaching is the proof you truly know it.", test: (st) => st.grandMaster },
];

function SessionChart({ timeline }) {
  const { T, S } = useUI();
  const RC = useRecharts();
  if (!RC) return null;
  const { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } = RC;
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}>this session's climb</div>
      <div style={{ height: 170, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={T.grid} strokeDasharray="3 3" />
            <XAxis dataKey="n" stroke={T.axis} tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} stroke={T.axis} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.edge}`, borderRadius: 10, fontSize: 12, color: T.ink }} labelFormatter={(n) => `after case ${n}`} />
            <Line type="monotone" dataKey="confidence" stroke={T.teal} strokeWidth={2.5} dot={{ r: 3, fill: T.teal }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Journey({ history, earnedBadges, maxCombo, topicStars, bankDone, xp, activeTitle, onShare }) {
  const { T, S, F, mobile } = useUI();
  const overall = overallConfidence(history);
  const grandMaster = earnedBadges.length >= BADGES.length && topicStars.length >= Object.keys(CONCEPTS).length;
  const st = { history, earnedBadges, topicStars, bankDone, overall, grandMaster };
  const doneCount = JOURNEY_STAGES.filter((j) => j.test(st)).length;
  const nextStage = JOURNEY_STAGES.find((j) => !j.test(st));
  const timeline = useMemo(() => {
    const pts = [{ n: 0, confidence: 0 }];
    for (let i = 1; i <= history.length; i++) pts.push({ n: i, confidence: overallConfidence(history.slice(0, i)) });
    return pts;
  }, [history]);

  return (
    <>
      {/* hero: where you are on the road */}
      <div style={{ ...S.panel, border: `1.5px solid ${grandMaster ? T.gold : T.accent}` }}>
        <div style={S.eyebrow}><Map size={13} color={T.accent} /> your journey · {doneCount} of {JOURNEY_STAGES.length} stages</div>
        <h1 style={S.h1}>{grandMaster ? "👑 You walked the whole road." : nextStage ? `Next stop: ${nextStage.emoji} ${nextStage.label}` : ""}</h1>
        {!grandMaster && nextStage && <p style={{ color: T.dim, fontSize: 14, fontWeight: 600 }}>{nextStage.desc}</p>}
        <div style={{ marginTop: 6 }}><Bar value={Math.round((doneCount / JOURNEY_STAGES.length) * 100)} color={grandMaster ? T.gold : T.accent} /></div>
        <button style={{ ...S.btn(false), marginTop: 14 }} onClick={onShare}><Share2 size={15} color={T.accent} /> Share my card</button>
      </div>

      {/* the path itself */}
      <div style={S.panel}>
        <div style={S.eyebrow}>the road so far</div>
        <div style={{ marginTop: 12 }}>
          {JOURNEY_STAGES.map((j, i) => {
            const done = j.test(st);
            const isNext = nextStage && nextStage.id === j.id;
            return (
              <div key={j.id} style={{ display: "flex", gap: 14, opacity: done || isNext ? 1 : 0.45 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
                    background: done ? T.tealSoft : isNext ? T.accentSoft : T.slot,
                    border: `2px solid ${done ? T.teal : isNext ? T.accent : T.edge}` }}>
                    {done ? j.emoji : isNext ? j.emoji : "🔒"}
                  </div>
                  {i < JOURNEY_STAGES.length - 1 && <div style={{ width: 3, flex: 1, minHeight: 18, background: done ? T.teal : T.edge, borderRadius: 2 }} />}
                </div>
                <div style={{ paddingBottom: 16 }}>
                  <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 15, color: done ? T.teal : isNext ? T.accent : T.dim }}>
                    {j.label} {done && "✓"}{isNext && " · you are here"}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, lineHeight: 1.5 }}>{j.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {grandMaster && (
        <div className="pd-pop" style={{ ...S.panel, border: `2px solid ${T.gold}`, textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>👑</div>
          <h1 style={{ ...S.h1, color: T.gold }}>GRAND MASTER DETECTIVE</h1>
          <p style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.7 }}>
            Every badge. Every star. This certificate is yours forever.<br />
            Your final mission: teach ONE problem to a friend or family member. When you can teach it, you truly own it.
          </p>
          <button style={S.btn(true)} onClick={onShare}><Share2 size={15} /> Share my golden card</button>
        </div>
      )}

      <CoachRead history={history} maxCombo={maxCombo} />

      {/* topic stars */}
      <div style={S.panel}>
        <div style={S.eyebrow}><Star size={13} color={T.gold} /> topic stars · {topicStars.length}/{Object.keys(CONCEPTS).length} · pass each topic test to collect them</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${mobile ? 116 : 140}px,1fr))`, gap: 8, marginTop: 12 }}>
          {Object.entries(CONCEPTS).map(([k, c]) => {
            const got = topicStars.includes(k);
            return (
              <div key={k} style={{ padding: "12px 10px", borderRadius: 12, textAlign: "center", border: `1.5px solid ${got ? T.gold : T.edgeSoft}`, background: got ? T.goldSoft : T.slot, opacity: got ? 1 : 0.55 }}>
                <div style={{ fontSize: 22 }}>{got ? "⭐" : CONCEPT_ICONS[k]}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 4, color: got ? T.ink : T.dim }}>{c.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* confidence per concept */}
      <div style={S.panel}>
        <div style={S.eyebrow}><TrendingUp size={13} color={T.teal} /> confidence · up when you solve, down if you lean on AI</div>
        <h1 style={{ ...S.h1, fontSize: Math.min(F.h1 || 26, 21) }}>Overall: <span style={{ color: T.teal }}>{overall}%</span></h1>
        <p style={{ color: T.dim, fontSize: 13.5, fontWeight: 500 }}>Solving alone: big jump UP. One AI tip: small step up. Two or more AI tips on one case: a small step DOWN. Word help is always free and never counted.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
          {Object.entries(CONCEPTS).map(([k, c]) => {
            const v = conceptConfidence(history, k);
            const bestTier = Math.max(-1, ...history.filter((h) => h.concept === k).map((h) => h.tier));
            return (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
                  <span>{CONCEPT_ICONS[k]} <strong>{c.label}</strong>{bestTier >= 0 && <span style={{ color: T.gold, fontSize: 11, fontWeight: 700 }}> · best: {TIER_NAMES[bestTier]}</span>}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: v >= 55 ? T.teal : T.dim }}>{v}% · {confLabel(v)}</span>
                </div>
                <Bar value={v} />
              </div>
            );
          })}
        </div>
      </div>

      {history.length >= 2 && <SessionChart timeline={timeline} />}

      {/* badges */}
      <div style={S.panel}>
        <div style={S.eyebrow}><Award size={13} /> badges · {earnedBadges.length}/{BADGES.length}</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${mobile ? 128 : 150}px,1fr))`, gap: 10, marginTop: 12 }}>
          {BADGES.map((b, i) => {
            const got = earnedBadges.includes(b.id);
            const hues = [T.accent, T.accent, T.accent, T.accent];
            const hue = hues[i % hues.length];
            return (
              <div key={b.id} style={{ padding: "15px 12px", borderRadius: 15, textAlign: "center", border: `1.5px solid ${got ? hue : T.edgeSoft}`, background: got ? hue + "1E" : T.slot, opacity: got ? 1 : 0.5 }}>
                <div style={{ width: 38, height: 38, margin: "0 auto", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: got ? hue + "33" : T.slot, border: `1.5px solid ${got ? hue : T.edge}` }}>
                  <b.Icon size={19} color={got ? hue : T.dim} />
                </div>
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 13, margin: "7px 0 3px", color: got ? T.ink : T.dim }}>{b.name}</div>
                <div style={{ fontSize: 11.5, color: T.dim, lineHeight: 1.45, fontWeight: 500 }}>{b.desc}</div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, marginTop: 12, marginBottom: 0 }}>
          👑 What happens when you earn them ALL? Collect every badge and every topic star to become GRAND MASTER — a golden title, a certificate card to share, and the final mission.
        </p>
      </div>
    </>
  );
}

/* ── the 99 bank screen ─────────────────────────────────────── */
function BankScreen({ bankDone, voice, onPick }) {
  const { T, S, F, mobile } = useUI();
  const [filter, setFilter] = useState(-1); // -1 = all
  const shown = BANK.filter((b) => filter === -1 || b.tier === filter);
  const tierColor = [T.accent, T.accent, T.accent, T.accent];
  return (
    <div style={S.panel}>
      <div style={S.eyebrow}><BookOpen size={13} /> the 99 · every number is always the same problem</div>
      <h1 style={S.h1}>The 99 Problems</h1>
      <p style={{ color: T.dim, fontSize: 14, fontWeight: 500 }}>
        99 fixed problems across all {ALL_CONCEPT_KEYS.length} math ideas. #1–27 Easy · #28–54 Medium · #55–78 Hard · #79–99 Advanced.
        You solved <strong style={{ color: T.teal }}>{bankDone.length} / 99</strong>.
      </p>
      <div style={{ marginTop: 8 }}><Bar value={Math.round((bankDone.length / 99) * 100)} /></div>
      <div style={{ display: "flex", gap: 7, margin: "14px 0 12px", flexWrap: "wrap" }}>
        {["All", ...TIER_NAMES].map((t, i) => (
          <button key={t} onClick={() => setFilter(i - 1)}
            style={{ padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${filter === i - 1 ? T.accent : T.edge}`, background: filter === i - 1 ? T.accentSoft : "transparent", color: filter === i - 1 ? T.accent : T.dim, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${mobile ? 112 : 148}px,1fr))`, gap: 8 }}>
        {shown.map((b) => {
          const done = bankDone.includes(b.n);
          return (
            <button key={b.n} onClick={() => onPick(generateQuest(b.concept, mulberry32(b.seed), { tier: b.tier, voice, bankId: b.n }))}
              style={{ textAlign: "left", padding: "11px 12px", borderRadius: 12, border: `1.5px solid ${done ? T.teal : T.edge}`, background: done ? T.tealSoft : T.slot, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: F.mono, fontWeight: 700, fontSize: 14, color: done ? T.teal : T.ink }}>#{b.n}{done ? " ✓" : ""}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: tierColor[b.tier], border: `1px solid ${tierColor[b.tier]}66`, borderRadius: 999, padding: "2px 8px" }}>{TIER_NAMES[b.tier]}</span>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: T.dim, marginTop: 5, lineHeight: 1.3 }}>{CONCEPT_ICONS[b.concept]} {CONCEPTS[b.concept].label}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: T.dim, marginTop: 3 }}>{CONCEPTS[b.concept].short}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* ── LOGIN / WELCOME ──────────────────────────────────────────
   In this preview, a profile is a name + avatar kept on this
   device. On deploy, this screen connects to real login
   (Supabase Auth: email code or Google) and progress syncs. */
const AVATARS = ["🕵️", "🦊", "🐼", "🚀", "🐯", "🌟", "🎧", "🐢"];
function Login({ defaultVoice, onDone, onGoogle, theme, setTheme }) {
  const { T, S, F, mobile } = useUI();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  return (
    <div className="pd-pop" style={{ ...S.panel, marginTop: mobile ? 20 : 48 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>{avatar}</div>
        <h1 style={S.h1}>Welcome, Detective.</h1>
        <p style={{ color: T.dim, fontSize: 14, fontWeight: 600, marginTop: 2 }}>Make your profile. Your progress belongs to it.</p>
      </div>
      {onGoogle && (
        <>
          <button style={{ ...S.btn(true), width: "100%", justifyContent: "center", marginTop: 16 }} onClick={onGoogle}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>G</span> Continue with Google
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 2px" }}>
            <div style={{ flex: 1, height: 1, background: T.edge }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.dim }}>or make a profile on this device</span>
            <div style={{ flex: 1, height: 1, background: T.edge }} />
          </div>
        </>
      )}
      <div style={{ ...S.eyebrow, marginTop: 14 }}>your name</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?"
        style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "13px 15px", borderRadius: 12, border: `1.5px solid ${T.edge}`, background: T.slot, color: T.ink, fontFamily: F.body, fontSize: 15, fontWeight: 700, outline: "none" }} />
      <div style={{ ...S.eyebrow, marginTop: 14 }}>pick your look · changes the whole app, right now</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {Object.values(THEME_PACKS).map((th) => (
          <button key={th.id} onClick={() => setTheme(th.id)} title={th.name}
            style={{ flex: 1, minWidth: 118, padding: "11px 10px", borderRadius: 12, cursor: "pointer", textAlign: "left", border: `2px solid ${theme === th.id ? T.accent : T.edgeStrong}`, background: th.colors.bg }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[th.colors.accent, th.colors.ink].map((c, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ fontWeight: 800, fontSize: 11.5, color: th.colors.ink }}>{th.name} {theme === th.id && "✓"}</div>
          </button>
        ))}
      </div>
      <div style={{ ...S.eyebrow, marginTop: 14 }}>pick your face</div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {AVATARS.map((a) => (
          <button key={a} onClick={() => setAvatar(a)}
            style={{ width: 46, height: 46, fontSize: 22, borderRadius: 12, cursor: "pointer", border: `2px solid ${avatar === a ? T.accent : T.edge}`, background: avatar === a ? T.accentSoft : T.slot }}>
            {a}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        <button style={{ ...S.btn(true), flex: 1 }} disabled={!name.trim()} onClick={() => onDone({ name: name.trim(), avatar }, defaultVoice)}>
          Start my journey <ChevronRight size={16} />
        </button>
        <button style={S.btn(false)} onClick={() => onDone({ name: "Detective", avatar: "🕵️" }, defaultVoice)}>Just let me in</button>
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: T.dim, marginTop: 12, marginBottom: 0 }}>
        🔒 In the full app this connects to real login (email or Google) so your progress follows you on any device.
      </p>
    </div>
  );
}

/* ── PROFILE: identity + all settings live here ─────────────── */
function Profile({ profile, setProfile, voice, setVoice, theme, setTheme, fontChoice, setFontChoice, xp, activeTitle, earnedBadges, topicStars, bankDone, onShare, onSignOut }) {
  const { T, S, F } = useUI();
  const sectionTitle = (icon, text) => <div style={{ ...S.eyebrow, marginTop: 4 }}>{icon} {text}</div>;
  return (
    <>
      <div style={S.panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, background: T.accentSoft, border: `2px solid ${T.accent}` }}>{profile.avatar}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: Math.min(F.h1 || 24, 22) }}>{profile.name}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.dim }}>{activeTitle} · ⚡ {xp} XP · 🏅 {earnedBadges.length} · ⭐ {topicStars.length} · 📚 {bankDone.length}/99</div>
          </div>
          <button style={S.btn(false)} onClick={onShare}><Share2 size={15} color={T.accent} /> Share card</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setProfile({ ...profile, avatar: a })}
              style={{ width: 38, height: 38, fontSize: 18, borderRadius: 10, cursor: "pointer", border: `2px solid ${profile.avatar === a ? T.accent : T.edge}`, background: profile.avatar === a ? T.accentSoft : T.slot }}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div style={S.panel}>
        {sectionTitle(<Palette size={12} />, "world · words, colors and stories")}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {Object.values(VOICES).map((v) => (
            <button key={v.id} onClick={() => setVoice(v.id)}
              style={{ flex: 1, minWidth: 150, textAlign: "left", padding: "13px 14px", borderRadius: 12, border: `2px solid ${voice === v.id ? T.accent : T.edge}`, background: voice === v.id ? T.accentSoft : T.slot, cursor: "pointer" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: voice === v.id ? T.accent : T.ink }}>{v.emoji} {v.name} {voice === v.id && "✓"}</div>
              <div style={{ fontSize: 11.5, color: T.dim, fontWeight: 600, marginTop: 2 }}>{v.tagline}</div>
            </button>
          ))}
        </div>

        {sectionTitle("🎨", "theme · your whole app, your look")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginTop: 10 }}>
          {Object.values(THEME_PACKS).map((th) => (
            <button key={th.id} onClick={() => setTheme(th.id)}
              style={{ padding: "13px 13px", borderRadius: 12, textAlign: "left", cursor: "pointer", border: `2px solid ${theme === th.id ? T.accent : T.edgeStrong}`, background: th.colors.bg, boxShadow: theme === th.id ? `0 0 0 3px ${T.accentSoft}` : "none" }}>
              <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
                {[th.colors.accent, th.colors.ink, th.colors.slot].map((c, i) => (
                  <span key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: `1px solid ${th.colors.edgeStrong}` }} />
                ))}
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: th.colors.ink }}>{th.emoji} {th.name} {theme === th.id && "✓"}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: th.colors.dim }}>{th.hint}</div>
            </button>
          ))}
        </div>

        {sectionTitle("🔤", "font · pick what feels easiest to read")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 10 }}>
          {Object.entries(FONT_CHOICES).map(([k, f]) => (
            <button key={k} onClick={() => setFontChoice(k)}
              style={{ padding: "12px 12px", borderRadius: 12, textAlign: "left", border: `2px solid ${fontChoice === k ? T.accent : T.edge}`, background: fontChoice === k ? T.accentSoft : T.slot, cursor: "pointer" }}>
              <div style={{ fontFamily: f.body || "inherit", fontWeight: 800, fontSize: 15, color: fontChoice === k ? T.accent : T.ink }}>Ag 123 {fontChoice === k && "✓"}</div>
              <div style={{ fontWeight: 800, fontSize: 12, marginTop: 3, color: T.ink }}>{f.label}</div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: T.dim }}>{f.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={S.panel}>
        {sectionTitle("🔒", "account")}
        <p style={{ fontSize: 13, fontWeight: 600, color: T.dim, lineHeight: 1.6, margin: "8px 0 12px" }}>
          Right now your profile lives on this device. When the app is deployed, real login (email or Google) connects here and your XP, stars and badges follow you everywhere.
        </p>
        <button style={S.btn(false)} onClick={onSignOut}>Sign out</button>
      </div>
    </>
  );
}


/* ── /card — the public page a shared link opens ────────────── */
function CardPage() {
  let d = null;
  try { d = JSON.parse(b64decode(window.location.hash.slice(1))); } catch { /* bad link */ }
  const box = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#101D19", fontFamily: "'Nunito', system-ui, sans-serif", padding: 16 };
  if (!d) return <div style={box}><div style={{ color: "#EDF8F1", fontWeight: 700 }}>This card link looks broken. <a href="/" style={{ color: "#54D6C9" }}>Go to DECODE →</a></div></div>;
  return (
    <div style={box}>
      <div style={{ background: "#1A2B25", border: `2px solid ${d.g ? "#F2BC5C" : "#52C98F"}`, borderRadius: 20, padding: 30, maxWidth: 380, width: "100%", textAlign: "center", color: "#EDF8F1" }}>
        <div style={{ fontSize: 40 }}>{d.g ? "👑" : "🕵️"}</div>
        <div style={{ fontSize: 21, fontWeight: 800, color: d.g ? "#F2BC5C" : "#52C98F", marginTop: 4 }}>{d.g ? "GRAND MASTER " : ""}{d.t}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#A3C1B0", marginTop: 8, lineHeight: 1.8 }}>
          ⚡ {d.x} XP<br />🏅 {(d.b || []).length} badges · ⭐ {d.s} topic stars<br />📚 {d.k} of The 99 solved
        </div>
        <a href="/" style={{ display: "inline-block", marginTop: 18, padding: "12px 22px", borderRadius: 12, background: "#52C98F", color: "#04170D", fontWeight: 800, textDecoration: "none" }}>
          Start your own journey →
        </a>
      </div>
    </div>
  );
}

/* ── root ───────────────────────────────────────────────────── */
export default function ProjectDecode() {
  if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/card") return <CardPage />;
  const saved = useMemo(loadSave, []);
  const [theme, setTheme] = useState(saved?.theme && THEME_PACKS[saved.theme] ? saved.theme : "duo");
  const [voice, setVoice] = useState(saved?.voice || "real");
  const [fontChoice, setFontChoice] = useState(saved?.fontChoice || "default");
  const [profile, setProfile] = useState(saved?.profile || null);
  const mobile = useIsMobile();
  const V = VOICES[voice];
  const TH = THEME_PACKS[theme];
  const F = useMemo(() => resolveFonts(TH, fontChoice), [TH, fontChoice]);
  const T = useMemo(() => buildPalette(theme), [theme]);
  const S = useMemo(() => makeStyles(T, F, TH, mobile), [T, F, TH, mobile]);

  const [screen, setScreen] = useState(saved?.profile ? "checkin" : "login");
  const [energy, setEnergy] = useState(3);
  const [xp, setXp] = useState(saved?.xp ?? 0);
  const [quest, setQuest] = useState(null);
  const [history, setHistory] = useState(saved?.history ?? []);
  const [earnedBadges, setEarnedBadges] = useState(saved?.earnedBadges ?? []);
  const [activeTitle, setActiveTitle] = useState(saved?.activeTitle ?? "Novice");
  const todayStr = new Date().toDateString();
  const [dailyDate, setDailyDate] = useState(saved?.dailyDate ?? "");
  const dailyDone = dailyDate === todayStr;
  const [attempt, setAttempt] = useState({ retries: 0, hint: false, assist: false, aiUses: 0 });
  const [lastResult, setLastResult] = useState(null);
  const [combo, setCombo] = useState(saved?.combo ?? 0);
  const [maxCombo, setMaxCombo] = useState(saved?.maxCombo ?? 0);
  const [bossesDone, setBossesDone] = useState(saved?.bossesDone ?? 0);
  const [relics, setRelics] = useState(saved?.relics ?? []);
  const [bankDone, setBankDone] = useState(saved?.bankDone ?? []);
  const [topicStars, setTopicStars] = useState(saved?.topicStars ?? []);
  const [quizDate, setQuizDate] = useState(saved?.quizDate ?? "");
  const [gameDate, setGameDate] = useState(saved?.gameDate ?? "");
  const [formulaDate, setFormulaDate] = useState(saved?.formulaDate ?? "");
  const [bestFormula, setBestFormula] = useState(saved?.bestFormula ?? 0);
  const [storyProgress, setStoryProgress] = useState(saved?.storyProgress ?? 0);
  const [storyItems, setStoryItems] = useState(saved?.storyItems ?? []);
  const [storyOutro, setStoryOutro] = useState(saved?.storyOutro ?? "");
  const formulaDone = formulaDate === todayStr;
  const quizDone = quizDate === todayStr;
  const gameDone = gameDate === todayStr;
  const [bestQuiz, setBestQuiz] = useState(saved?.bestQuiz ?? 0);
  const [bestGame, setBestGame] = useState(saved?.bestGame ?? 0);
  const [shareOpen, setShareOpen] = useState(false);
  const [testConcept, setTestConcept] = useState(null);

  const bossReady = Math.floor(history.length / 3) > bossesDone;
  const dailyQuest = useMemo(() => {
    const rng = mulberry32(hashStr(new Date().toDateString() + voice));
    return generateQuest(pick(rng, Object.keys(CONCEPTS)), rng, { daily: true, tier: 1, voice });
  }, [voice]);

  const startQuest = (q) => { setQuest(q); setAttempt({ retries: 0, hint: false, assist: false, aiUses: 0 }); setScreen("story"); };
  const startBoss = () => {
    const rng = mulberry32((Math.random() * 1e9) | 0);
    startQuest(generateQuest(pick(rng, ["ratedrain", "ratebuild"]), rng, { boss: true, voice }));
  };
  const countRetry = () => setAttempt((a) => ({ ...a, retries: a.retries + 1 }));
  const markAssist = () => setAttempt((a) => ({ ...a, assist: true, aiUses: a.aiUses + 1 }));

  const finishQuest = () => {
    const clean = attempt.retries === 0 && !attempt.hint && !attempt.assist;
    const assist = attempt.hint || attempt.assist;
    const entry = { concept: quest.concept, tier: quest.tier, clean, assist, aiUses: attempt.aiUses, retries: attempt.retries, daily: quest.daily, boss: quest.boss, custom: quest.custom };
    const mult = 1 + 0.25 * Math.min(combo, 4);
    const loot = rollLoot(relics);
    const gained = Math.round(quest.xp * mult) + (loot.duplicate ? 15 : 0);
    const confBefore = conceptConfidence(history, quest.concept);
    const nextHistory = [...history, entry];
    const confAfter = conceptConfidence(nextHistory, quest.concept);
    const nextCombo = clean ? combo + 1 : 0;
    const nextMax = Math.max(maxCombo, nextCombo);
    const nextXp = xp + gained;
    const state = { history: nextHistory, xp: nextXp, maxCombo: nextMax, bestQuiz, bestGame, topicStars, bestFormula, storyProgress };
    const newlyEarned = BADGES.filter((b) => !earnedBadges.includes(b.id) && b.test(state));

    setHistory(nextHistory); setXp(nextXp); setCombo(nextCombo); setMaxCombo(nextMax);
    setEarnedBadges((e) => [...e, ...newlyEarned.map((b) => b.id)]);
    if (!loot.duplicate) setRelics((r) => [...r, loot.item.id]);
    if (quest.daily) setDailyDate(todayStr);
    if (quest.storyChapter != null && quest.storyChapter === storyProgress) {
      const next = storyProgress + 1;
      setStoryProgress(next);
      const ch = STORY_SEASON.chapters[quest.storyChapter];
      if (ch?.outro) setStoryOutro(ch.outro(`${quest.answer} ${quest.unit}`));
      if (next >= STORY_SEASON.chapters.length) setXp((x) => x + 150); // season bonus
      recheckBadges({ storyProgress: next });
    }
    if (quest.boss) setBossesDone((n) => n + 1);
    if (quest.bankId && !bankDone.includes(quest.bankId)) setBankDone((d) => [...d, quest.bankId]);
    const best = [...MILESTONES].reverse().find((m) => nextXp >= m.xp);
    if (best) setActiveTitle((t) => (MILESTONES.findIndex((m) => m.title === t) < MILESTONES.findIndex((m) => m.title === best.title) ? best.title : t));
    setLastResult({ gained, mult, newBadges: newlyEarned, confBefore, confAfter, loot, praise: V.ui.praise[Math.floor(Math.random() * V.ui.praise.length)] });
    setScreen("done");
  };

  // persist everything on this device
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        theme, voice, fontChoice, profile, xp, history, earnedBadges, activeTitle,
        combo, maxCombo, bossesDone, relics, bankDone, topicStars, bestQuiz, bestGame,
        dailyDate, quizDate, gameDate, formulaDate, bestFormula, storyProgress, storyItems, storyOutro,
      }));
    } catch { /* storage full or blocked — app still works */ }
  }, [theme, voice, fontChoice, profile, xp, history, earnedBadges, activeTitle, combo, maxCombo, bossesDone, relics, bankDone, topicStars, bestQuiz, bestGame, dailyDate, quizDate, gameDate, formulaDate, bestFormula, storyProgress, storyItems, storyOutro]);

  // Google login (only when Supabase is configured)
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (u && !profile) {
        setProfile({ name: u.user_metadata?.full_name || u.email.split("@")[0], avatar: "🕵️", email: u.email });
        setScreen("checkin");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      if (u) {
        setProfile((pr) => pr || { name: u.user_metadata?.full_name || u.email.split("@")[0], avatar: "🕵️", email: u.email });
        setScreen((sc) => (sc === "login" ? "checkin" : sc));
      }
    });
    return () => sub?.subscription?.unsubscribe();
  }, []); // eslint-disable-line

  const googleLogin = supabase
    ? () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })
    : null;

  const recheckBadges = (patch = {}) => {
    const state = { history, xp, maxCombo, bestQuiz, bestGame, topicStars, bestFormula, storyProgress, ...patch };
    const newly = BADGES.filter((b) => !earnedBadges.includes(b.id) && b.test(state));
    if (newly.length) setEarnedBadges((e) => [...e, ...newly.map((b) => b.id)]);
  };
  const finishSelfTest = (hits, quests) => {
    // each first-try hit counts as a clean solve for confidence
    const entries = quests.slice(0, hits).map((q) => ({ concept: q.concept, tier: q.tier, clean: true, assist: false, aiUses: 0, retries: 0 }));
    const nextHistory = [...history, ...entries];
    setHistory(nextHistory);
    setXp((x) => x + 40 + hits * 20);
    if (hits >= 2 && !topicStars.includes(testConcept)) {
      const nextStars = [...topicStars, testConcept];
      setTopicStars(nextStars);
      recheckBadges({ history: nextHistory, topicStars: nextStars });
    } else recheckBadges({ history: nextHistory });
  };
  const finishQuiz = (score) => {
    setQuizDate(todayStr); setXp((x) => x + score * 15);
    const nb = Math.max(bestQuiz, score); setBestQuiz(nb); recheckBadges({ bestQuiz: nb });
  };
  const finishFormula = (score) => {
    setFormulaDate(todayStr); setXp((x) => x + score * 10);
    const nb = Math.max(bestFormula, score); setBestFormula(nb); recheckBadges({ bestFormula: nb });
  };
  const finishGame = (score) => {
    setGameDate(todayStr); setXp((x) => x + score * 10);
    const nb = Math.max(bestGame, score); setBestGame(nb); recheckBadges({ bestGame: nb });
  };
  const grandMaster = earnedBadges.length >= BADGES.length && topicStars.length >= Object.keys(CONCEPTS).length;

  return (
    <UICtx.Provider value={{ T, S, F, V, TH, mode: TH.dark ? "dark" : "light", mobile }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=Fraunces:wght@600;700&family=Lora:wght@500;600;700&family=Nunito:wght@500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes pdQuoteIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .pd-quote { animation: pdQuoteIn .6s ease; }
        @keyframes pdPop { from { opacity: 0; transform: scale(.97) translateY(4px); } to { opacity: 1; transform: none; } }
        .pd-pop { animation: pdPop .35s cubic-bezier(.2,.8,.2,1); }
        @keyframes pdFall { 0% { transform: translateY(-10px) rotate(0deg); opacity: 1; } 100% { transform: translateY(340px) rotate(300deg); opacity: 0; } }
        .pd-confetti { animation: pdFall linear forwards; }
        @keyframes pdSpin { to { transform: rotate(360deg); } }
        .pd-spin { animation: pdSpin 1s linear infinite; }
        button { transition: filter .15s ease, transform .1s ease; }
        button:hover:not(:disabled) { filter: brightness(0.96); }
        button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
        .pd-choice:hover { transform: translateY(-1px); }
        .pd-card { transition: border .2s ease, transform .15s ease; }
        .pd-card:hover { transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) { .pd-quote,.pd-pop,.pd-confetti,.pd-spin { animation: none !important; } .pd-choice:hover,.pd-card:hover { transform: none; } }
        button:disabled { opacity: .55; cursor: default; }
        button:not(:disabled):active { transform: scale(.98); }
        input::placeholder { opacity: .55; }
      `}</style>
      <div style={S.app}>
        <div style={S.shell}>
          {screen !== "checkin" && screen !== "login" && (
            <Header xp={xp} title={activeTitle} combo={combo} screen={screen} go={setScreen} voice={voice} profile={profile} />
          )}
          {screen !== "login" && <QuoteBanner />}
          {screen === "login" && (
            <Login defaultVoice={voice} onDone={(prof, w) => { setProfile(prof); setVoice(w); setScreen("checkin"); }} onGoogle={googleLogin} theme={theme} setTheme={setTheme} />
          )}
          {screen === "checkin" && <CheckIn onDone={(lvl) => { setEnergy(lvl); setScreen("log"); }} />}
          {screen === "log" && (
            <CaseBoard energy={energy} dailyDone={dailyDone} dailyQuest={dailyQuest} history={history} bossReady={bossReady} onPick={startQuest} onBoss={startBoss} voice={voice}
              quizDone={quizDone} gameDone={gameDone} onQuiz={finishQuiz} onGame={finishGame} topicStars={topicStars}
              storyProgress={storyProgress} formulaDone={formulaDone} onFormula={finishFormula}
              storyItems={storyItems} onStoryItem={(it) => setStoryItems((xs) => [...xs, it])} storyOutro={storyOutro}
              onSelfTest={(k) => { setTestConcept(k); setScreen("selftest"); }} />
          )}
          {screen === "story" && <StoryMode quest={quest} onPass={() => setScreen("translate")} onBack={() => setScreen("log")} />}
          {screen === "translate" && <Translation quest={quest} attempt={attempt} countRetry={countRetry} onAssist={markAssist} onPass={() => setScreen("calc")} onBack={() => setScreen("story")} />}
          {screen === "calc" && (
            <Calculation quest={quest} attempt={attempt} countRetry={countRetry} hintUsed={attempt.hint} useHint={() => setAttempt((a) => ({ ...a, hint: true }))} onAssist={markAssist} onPass={finishQuest} onBack={() => setScreen("translate")} />
          )}
          {screen === "done" && lastResult && <Complete quest={quest} result={lastResult} onHome={() => setScreen("log")} onShare={() => setShareOpen(true)} />}
          {screen === "journey" && <Journey history={history} earnedBadges={earnedBadges} maxCombo={maxCombo} topicStars={topicStars} bankDone={bankDone} xp={xp} activeTitle={activeTitle} onShare={() => setShareOpen(true)} />}
          {screen === "forge" && <Rewards xp={xp} activeTitle={activeTitle} onEquip={setActiveTitle} relics={relics} />}
          {screen === "bank" && <BankScreen bankDone={bankDone} voice={voice} onPick={startQuest} />}
          {screen === "profile" && profile && (
            <Profile profile={profile} setProfile={setProfile} voice={voice} setVoice={setVoice} theme={theme} setTheme={setTheme}
              fontChoice={fontChoice} setFontChoice={setFontChoice} xp={xp} activeTitle={activeTitle}
              earnedBadges={earnedBadges} topicStars={topicStars} bankDone={bankDone}
              onShare={() => setShareOpen(true)} onSignOut={() => { if (supabase) supabase.auth.signOut(); setProfile(null); setScreen("login"); }} />
          )}
          {screen === "selftest" && testConcept && (
            <SelfTest concept={testConcept} voice={voice} onDone={finishSelfTest} onBack={() => { setTestConcept(null); setScreen("log"); }} />
          )}
          <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} xp={xp} title={activeTitle} earnedBadges={earnedBadges} topicStars={topicStars} bankDone={bankDone} grandMaster={grandMaster} />
        </div>
      </div>
    </UICtx.Provider>
  );
}
