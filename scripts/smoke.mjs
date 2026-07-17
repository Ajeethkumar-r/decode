/* Smoke test: actually RENDERS every screen component in both voices
   and both modes. Catches "X is not defined", bad props, and
   voice-specific crashes before they reach a user.
   Run: node scripts/smoke.mjs                                       */
import { execSync } from "child_process";
import fs from "fs";

// 1. make a test build of App with everything exported
const src = fs.readFileSync("src/App.jsx", "utf8");
const exports_ = `
export { UICtx, VOICES, CONCEPTS, BADGES, TIER_NAMES, buildPalette, makeStyles, resolveFonts,
  generateQuest, mulberry32, hashStr, rollLoot,
  Login, Profile, CheckIn, CaseBoard, StoryMode, Translation, Calculation, Complete,
  Journey, BankScreen, Rewards, SelfTest, DailyQuiz, DailyGame, ShareModal, QuoteBanner,
  Header, MyQuestion, CaseForge, SidekickChat, StoryText, ConceptVisual, Stepper, BackBtn };
`;
fs.writeFileSync("src/AppTest.jsx", src + exports_);
execSync(`npx esbuild src/AppTest.jsx --bundle --format=esm --outfile=scripts/.test-bundle.mjs --loader:.jsx=jsx --external:react --external:react-dom '--define:import.meta.env={"VITE_SUPABASE_URL":"","VITE_SUPABASE_ANON_KEY":""}'`, { stdio: "pipe" });

// 2. browser-ish globals
const { JSDOM } = await import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
global.window = dom.window; global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
// Node 22 has native atob/btoa — do not override with detached jsdom fns

const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server");
const M = await import("./.test-bundle.mjs");

const attempt = { retries: 0, hint: false, assist: false, aiUses: 0 };
const history = [
  { concept: "takeaway", tier: 0, clean: true, assist: false, aiUses: 0, retries: 0 },
  { concept: "percent", tier: 1, clean: false, assist: true, aiUses: 1, retries: 1 },
  { concept: "ratebuild", tier: 2, clean: true, assist: false, aiUses: 0, retries: 0 },
];
const profile = { name: "Tester", avatar: "🕵️" };
const noop = () => {};

let pass = 0, fail = 0;
function t(label, el) {
  try { renderToString(el); pass++; }
  catch (e) { fail++; console.log(`  ❌ ${label}: ${e.message}`); }
}

for (const voice of ["real", "arcade"]) {
  for (const mode of ["dark", "light"]) {
    const V = M.VOICES[voice];
    const F = M.resolveFonts(V, "default");
    const T = M.buildPalette(mode, voice);
    for (const mobile of [false, true]) {
      const S = M.makeStyles(T, F, V, mobile);
      const wrap = (el) => React.createElement(M.UICtx.Provider, { value: { T, S, F, V, mode, mobile } }, el);
      const q = M.generateQuest("ratebuild", M.mulberry32(42), { tier: 1, voice });
      const daily = M.generateQuest("percent", M.mulberry32(7), { daily: true, tier: 1, voice });
      const result = { gained: 120, mult: 1.25, newBadges: [M.BADGES[0]], confBefore: 12, confAfter: 34, loot: M.rollLoot([]), praise: "test praise" };
      const tag = `${voice}/${mode}/${mobile ? "mobile" : "desktop"}`;

      t(`${tag} Login`, wrap(React.createElement(M.Login, { defaultVoice: voice, onDone: noop, onGoogle: noop })));
      t(`${tag} CheckIn`, wrap(React.createElement(M.CheckIn, { onDone: noop })));
      t(`${tag} QuoteBanner`, wrap(React.createElement(M.QuoteBanner)));
      t(`${tag} Header`, wrap(React.createElement(M.Header, { xp: 500, title: "Novice", combo: 2, screen: "log", go: noop, voice, profile })));
      t(`${tag} CaseBoard`, wrap(React.createElement(M.CaseBoard, { energy: 4, dailyDone: false, dailyQuest: daily, history, bossReady: true, onPick: noop, onBoss: noop, voice, quizDone: false, gameDone: false, onQuiz: noop, onGame: noop, topicStars: ["takeaway"], onSelfTest: noop })));
      t(`${tag} StoryMode`, wrap(React.createElement(M.StoryMode, { quest: q, onPass: noop, onBack: noop })));
      t(`${tag} Translation`, wrap(React.createElement(M.Translation, { quest: q, attempt, onPass: noop, countRetry: noop, onAssist: noop, onBack: noop })));
      t(`${tag} Calculation`, wrap(React.createElement(M.Calculation, { quest: q, attempt, onPass: noop, countRetry: noop, useHint: noop, hintUsed: true, onAssist: noop, onBack: noop })));
      t(`${tag} Complete`, wrap(React.createElement(M.Complete, { quest: q, result, onHome: noop, onShare: noop })));
      t(`${tag} Journey`, wrap(React.createElement(M.Journey, { history, earnedBadges: ["first", "clean"], maxCombo: 3, topicStars: ["takeaway"], bankDone: [1, 2], xp: 500, activeTitle: "Novice", onShare: noop })));
      t(`${tag} BankScreen`, wrap(React.createElement(M.BankScreen, { bankDone: [1], voice, onPick: noop })));
      t(`${tag} Rewards`, wrap(React.createElement(M.Rewards, { xp: 500, activeTitle: "Novice", onEquip: noop, relics: ["chip", "sigil"] })));
      t(`${tag} Profile`, wrap(React.createElement(M.Profile, { profile, setProfile: noop, voice, setVoice: noop, mode, setMode: noop, fontChoice: "default", setFontChoice: noop, xp: 500, activeTitle: "Novice", earnedBadges: ["first"], topicStars: [], bankDone: [], onShare: noop, onSignOut: noop })));
      t(`${tag} SelfTest`, wrap(React.createElement(M.SelfTest, { concept: "percent", voice, onDone: noop, onBack: noop })));
      t(`${tag} DailyQuiz`, wrap(React.createElement(M.DailyQuiz, { done: false, onFinish: noop })));
      t(`${tag} DailyGame`, wrap(React.createElement(M.DailyGame, { done: false, onFinish: noop })));
      t(`${tag} ShareModal`, wrap(React.createElement(M.ShareModal, { open: true, onClose: noop, xp: 500, title: "Novice", earnedBadges: ["first"], topicStars: ["takeaway"], bankDone: [1], grandMaster: false })));
      t(`${tag} MyQuestion`, wrap(React.createElement(M.MyQuestion, { voice, onQuest: noop })));
      t(`${tag} CaseForge`, wrap(React.createElement(M.CaseForge, { maxTier: 2, onQuest: noop })));
      t(`${tag} SidekickChat`, wrap(React.createElement(M.SidekickChat, { quest: q, attempt, onAssist: noop })));
      t(`${tag} StoryText`, wrap(React.createElement(M.StoryText, { text: q.raw, glossary: q.glossary })));
      t(`${tag} ConceptVisual(all)`, wrap(React.createElement("div", null,
        ...["takeaway", "ratedrain", "ratebuild", "fairsplit", "percent", "arearect"].map((c) =>
          React.createElement(M.ConceptVisual, { key: c, viz: M.generateQuest(c, M.mulberry32(9), { tier: 0, voice }).viz, showAnswer: true })))));
    }
  }
}

// full-app render paths: fresh login + saved-profile boot
const App = M.default;
localStorage.clear();
t("App (fresh → login)", React.createElement(App));
localStorage.setItem("decode-save-v1", JSON.stringify({ profile, xp: 300, history, earnedBadges: ["first"], topicStars: [], bankDone: [], relics: [], mode: "light", voice: "arcade", fontChoice: "friendly", activeTitle: "Signal Tracer", combo: 1, maxCombo: 2, bossesDone: 0, bestQuiz: 4, bestGame: 5, dailyDate: "", quizDate: "", gameDate: "" }));
t("App (saved → checkin, arcade/light/friendly)", React.createElement(App));

fs.unlinkSync("src/AppTest.jsx"); fs.unlinkSync("scripts/.test-bundle.mjs");
console.log(`\n${pass} renders passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
