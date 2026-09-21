import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTextCandidates, extractUrlCandidates, normalizeSpokenUrl, parseCandidatePick, toHttpUrl } from "../../src/spans.js";

test("text candidates: 'type X into the search box' offers the bare payload first", () => {
  const c = extractTextCandidates("type hello world into the search box");
  assert.equal(c[0], "hello world");
  assert.ok(c.includes("hello world into the search box"));
  assert.ok(c.includes("type hello world into the search box"), "whole transcript is always a fallback");
});

test("text candidates: 'search for X' and 'look up X'", () => {
  assert.equal(extractTextCandidates("search for jev typesafe")[0], "jev typesafe");
  assert.equal(extractTextCandidates("look up alan turing please")[0], "alan turing");
  assert.equal(extractTextCandidates("search wikipedia for cats")[0], "cats");
  assert.equal(extractTextCandidates("google cheap flights to lisbon")[0], "cheap flights to lisbon");
});

test("text candidates: quoted spans win", () => {
  assert.equal(extractTextCandidates('type "good morning" in the comment box')[0], "good morning");
});

test("text candidates: empty / no verbs", () => {
  assert.deepEqual(extractTextCandidates(""), []);
  const c = extractTextCandidates("scroll down");
  assert.ok(c.includes("scroll down"));
  assert.ok(c.length <= 8);
});

test("text candidates are unique and capped", () => {
  const c = extractTextCandidates("search for search for search for a b c d e f g h i j");
  assert.equal(new Set(c.map((s) => s.toLowerCase())).size, c.length);
  assert.ok(c.length <= 8);
});

test("spoken URLs: 'example dot com' -> example.com", () => {
  assert.equal(normalizeSpokenUrl("go to example dot com"), "go to example.com");
  assert.deepEqual(extractUrlCandidates("go to example dot com"), ["example.com"]);
  assert.deepEqual(extractUrlCandidates("open news dot ycombinator dot com please"), ["news.ycombinator.com"]);
  assert.deepEqual(extractUrlCandidates("visit https://docs.typesafe.ai/models"), ["https://docs.typesafe.ai/models"]);
  assert.deepEqual(extractUrlCandidates("scroll down a bit"), []);
});

test("toHttpUrl adds https", () => {
  assert.equal(toHttpUrl("example.com"), "https://example.com");
  assert.equal(toHttpUrl("http://a.b"), "http://a.b");
});

test("candidate pick parsing", () => {
  assert.equal(parseCandidatePick("two"), 2);
  assert.equal(parseCandidatePick("the second one"), 2);
  assert.equal(parseCandidatePick("number 3"), 3);
  assert.equal(parseCandidatePick("click the first one"), 1);
  assert.equal(parseCandidatePick("one"), 1);
  assert.equal(parseCandidatePick("four", 3), null, "out of range");
  assert.equal(parseCandidatePick("go to wikipedia"), null);
  assert.equal(parseCandidatePick(""), null);
});

// Estonian: destination comes before the payload ("kirjuta otsingukasti tere maailm"), unlike English.
test("text candidates: Estonian 'kirjuta otsingukasti X' (destination before payload)", () => {
  assert.ok(extractTextCandidates("kirjuta otsingukasti tere maailm").includes("tere maailm"));
});

// LEADING_DEST_RE can over-strip a word that reads as a destination noun but is actually payload
// ("reale" = "to the field", but here "Real Madrid" is what's being typed); keep the un-stripped
// tail as a fallback candidate too, same pattern as TRAILING_DEST_RE's fallback.
test("text candidates: LEADING_DEST_RE over-strip keeps the un-stripped tail as a fallback", () => {
  assert.ok(extractTextCandidates("enter reale madrid").includes("reale madrid"));
});

// Estonian: destination noun can also trail with no preposition ("... otsingukasti").
test("text candidates: Estonian 'kirjuta X otsingukasti' (destination after payload)", () => {
  assert.ok(extractTextCandidates("kirjuta tere maailm otsingukasti").includes("tere maailm"));
});

test("text candidates: Estonian 'otsi X' and inflected site names", () => {
  assert.equal(extractTextCandidates("otsi alan turing")[0], "alan turing");
  assert.ok(extractTextCandidates("otsi youtubest lofi muusikat").includes("lofi muusikat"));
  assert.ok(extractTextCandidates("otsi youtubist lofi muusikat").includes("lofi muusikat"));
});

test("text candidates: Estonian filler words are stripped", () => {
  assert.ok(extractTextCandidates("otsi palun kassid").includes("kassid"));
});

test("spoken URLs: Estonian 'punkt' -> '.'", () => {
  assert.deepEqual(extractUrlCandidates("ava postimees punkt ee"), ["postimees.ee"]);
  assert.deepEqual(extractUrlCandidates("mine example punkt com"), ["example.com"]);
});

test("candidate pick parsing: Estonian number words", () => {
  assert.equal(parseCandidatePick("teine"), 2);
  assert.equal(parseCandidatePick("see esimene"), 1);
  // "see" is not a stopword (only "seda" is): plain English "see to"/"see for" must not resolve
  // to a deterministic pick via the single-word homophone fallback.
  assert.equal(parseCandidatePick("see to"), null);
  assert.equal(parseCandidatePick("see for"), null);
});
