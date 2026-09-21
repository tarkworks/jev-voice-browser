/**
 * Estonian counterpart to jev-decisions.test.js: same rig (real Jev API, page snapshot
 * fixtures), same pass/fail shape, but transcripts are Estonian. Bilingual support only
 * extends candidate extraction and prompt examples (see src/spans.js, src/constants.js);
 * this file checks Jev still lands on the right intent/target/decision for Estonian speech.
 *
 * Requires TYPESAFE_API_KEY (or JEV_API_KEY); skips otherwise. Lower pass-rate bar than the
 * English suite (80% vs 90%) since Estonian coverage is new and less tuned.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, hasApiKey } from "../../src/jev.js";
import { evaluatePolicy } from "../../src/policy.js";
import { MODEL } from "../../src/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", `${name}.json`), "utf8"));

/**
 * Each case: transcript + snapshot + expectations on Jev's raw answers and/or the policy result.
 *   intent:   expected `intent.choice`
 *   target:   expected `target.choice` (optional)
 *   decision: expected policy decision (optional)
 *   text:     expected verbatim text_span (optional)
 *   final:    treat as a final utterance (default true so `complete` doesn't gate)
 */
const CASES = [
  { name: "keri natuke alla", transcript: "keri natuke alla", snapshot: "wikipedia-article", intent: "scroll_down", decision: "act" },
  { name: "keri lehe lõppu", transcript: "keri lehe lõppu", snapshot: "wikipedia-article", intent: "scroll_down", decision: "act" },
  { name: "keri üles", transcript: "keri üles", snapshot: "hn", intent: "scroll_up", decision: "act" },
  { name: "mine vikipeediasse", transcript: "mine vikipeediasse", snapshot: "example", intent: "navigate_url", decision: "act", url: "wikipedia.org" },
  { name: "ava youtube", transcript: "ava youtube", snapshot: "hn", intent: "navigate_url", decision: "act", url: "youtube.com" },
  { name: "otsi alan turing", transcript: "otsi alan turing", snapshot: "wikipedia-main", intent: "search_web", decision: "act", text: "alan turing" },
  {
    name: "otsi youtubest lofi muusikat",
    transcript: "otsi youtubest lofi muusikat",
    snapshot: "hn",
    intent: "search_web",
    decision: "act",
    text: "lofi muusikat",
    url: "youtube.com/results",
  },
  { name: "klõpsa lingil new", transcript: "klõpsa lingil new", snapshot: "hn", intent: "click_element", target: "e03", decision: "act" },
  { name: "ava kommentaarid", transcript: "ava kommentaarid", snapshot: "hn", intent: "click_element", target: "e05", decision: "act" },
  { name: "mine tagasi", transcript: "mine tagasi", snapshot: "wikipedia-article", intent: "go_back", decision: "act" },
  { name: "laadi leht uuesti", transcript: "laadi leht uuesti", snapshot: "hn", intent: "reload", decision: "act" },
  { name: "ava uus vaheleht", transcript: "ava uus vaheleht", snapshot: "hn", intent: "open_new_tab", decision: "act" },
  {
    name: "kirjuta otsingukasti tere maailm",
    transcript: "kirjuta otsingukasti tere maailm",
    snapshot: "wikipedia-main",
    intent: "type_into_field",
    target: "e02",
    text: "tere maailm",
    decision: "act",
  },
  { name: "chit-chat ignored", transcript: "nii et ma arvan et võiks lõunale minna", snapshot: "hn", decision: "ignore" },
  { name: "partial 'mine' waits", transcript: "mine", snapshot: "hn", final: false, decisionIn: ["wait", "ignore"] },
];

const results = [];

before(() => {
  if (!hasApiKey()) console.log("SKIP: no TYPESAFE_API_KEY / JEV_API_KEY set");
});

for (const c of CASES) {
  test(`jev (et): ${c.name} — "${c.transcript}"`, { skip: !hasApiKey() }, async () => {
    const snapshot = typeof c.snapshot === "string" ? fixture(c.snapshot) : c.snapshot;
    const r = await decide({ transcript: c.transcript, snapshot });
    const policy = evaluatePolicy({ answers: r.answers, candidates: r.candidates, snapshot, isFinal: c.final !== false });
    const a = r.answers;
    const failures = [];
    if (c.intent && a.intent.choice !== c.intent) failures.push(`intent ${a.intent.choice} != ${c.intent} (conf ${a.intent.confidence.toFixed(2)})`);
    if (c.target && a.target.choice !== c.target) failures.push(`target ${a.target.choice} != ${c.target} (conf ${a.target.confidence.toFixed(2)})`);
    if (c.decision && policy.decision !== c.decision) failures.push(`decision ${policy.decision} != ${c.decision} (${policy.summary})`);
    if (c.decisionIn && !c.decisionIn.includes(policy.decision)) failures.push(`decision ${policy.decision} not in ${c.decisionIn} (${policy.summary})`);
    if (c.text && policy.action?.text !== c.text && policy.action?.query !== c.text) failures.push(`text ${JSON.stringify(policy.action?.text ?? policy.action?.query)} != ${JSON.stringify(c.text)}`);
    if (c.url && !(policy.action?.url || "").includes(c.url)) failures.push(`url ${policy.action?.url} !~ ${c.url}`);
    if (c.amount && policy.action?.amount !== c.amount) failures.push(`amount ${policy.action?.amount} != ${c.amount}`);

    results.push({ name: c.name, ok: failures.length === 0, latency: r.latencyMs, tokens: r.usage.input_tokens, failures });
    console.log(
      `  ${failures.length ? "✗" : "✓"} ${c.name.padEnd(30)} ${String(r.latencyMs).padStart(4)}ms ${String(r.usage.input_tokens).padStart(5)}tok  intent=${a.intent.choice}(${a.intent.confidence.toFixed(2)}) target=${a.target.choice}(${a.target.confidence.toFixed(2)}) complete=${a.complete.noul.toFixed(2)} cmd=${a.is_command.noul.toFixed(2)} destr=${a.destructive.noul.toFixed(2)} → ${policy.decision}${failures.length ? "\n      " + failures.join("; ") : ""}`,
    );
    assert.deepEqual(failures, [], failures.join("; "));
  });
}

test("integration pass-rate report (et)", { skip: !hasApiKey() }, () => {
  const passed = results.filter((r) => r.ok).length;
  const lat = results.map((r) => r.latency).sort((a, b) => a - b);
  const p50 = lat[Math.floor(lat.length / 2)];
  const avg = Math.round(lat.reduce((a, b) => a + b, 0) / lat.length);
  const tokens = results.reduce((a, r) => a + r.tokens, 0);
  const rate = passed / results.length;
  console.log(`\n  ${MODEL} (et): ${passed}/${results.length} cases passed (${(rate * 100).toFixed(1)}%) · latency avg ${avg} ms, p50 ${p50} ms, max ${lat[lat.length - 1]} ms · ${tokens} input tokens ($${((tokens / 1e6) * 0.042).toFixed(5)})\n`);
  assert.ok(rate >= 0.8, `pass rate ${(rate * 100).toFixed(1)}% is below 80%`);
});
