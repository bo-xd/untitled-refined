const assert = require("node:assert/strict");
const test = require("node:test");

require("../src/ranking.js");

const { normalize, rank, score } = globalThis.__untitledExactSearchRanking;

test("normalizes apostrophes, accents, punctuation, and whitespace", () => {
  assert.equal(normalize("  IT’S—Yóu!! "), "its you");
});

test("ranks an exact title ahead of loose matches", () => {
  const tracks = [
    { title: "Run After You" },
    { title: "I Let You Down" },
    { title: "It's You" },
    { title: "Enjoy Who’s In Your Bed [V1]" },
  ];

  const rankedTitles = rank(tracks, "it's you").map((track) => track.title);

  assert.equal(rankedTitles[0], "It's You");
  assert.deepEqual(new Set(rankedTitles), new Set(tracks.map((track) => track.title)));
});

test("ranks a clean title before versioned variants", () => {
  const tracks = [
    { title: "Heart In Your Mouth [V1]" },
    { title: "Heart In Your Mouth" },
    { title: "Heart In Your Mouth (Live)" },
  ];

  assert.deepEqual(
    rank(tracks, "heart in your mouth").map((track) => track.title),
    ["Heart In Your Mouth", "Heart In Your Mouth [V1]", "Heart In Your Mouth (Live)"],
  );
});

test("keeps the original order when scores tie", () => {
  const tracks = [{ title: "You A" }, { title: "You B" }, { title: "You C" }];
  assert.deepEqual(rank(tracks, "you"), tracks);
});

test("uses lower scores for stronger matches", () => {
  assert.ok(score("It's You", "it's you") < score("It's You [V1]", "it's you"));
  assert.ok(score("It's You [V1]", "it's you") < score("Run After You", "it's you"));
});
