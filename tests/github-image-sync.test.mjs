import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "../tools/sync-github-image-themes.mjs";

test("GitHub image sync defaults to the published repository", () => {
  const options = parseArgs([]);
  assert.equal(options.repo, "d100000/CodeX-Skin");
  assert.equal(options.ref, "main");
  assert.equal(options.prune, false);
});

test("GitHub image sync accepts release ref and prune mode", () => {
  const options = parseArgs(["--repo", "acme/skins", "--ref", "v1.2.3", "--prune", "--dry-run"]);
  assert.deepEqual(options, { repo: "acme/skins", ref: "v1.2.3", prune: true, dryRun: true });
});

test("release workflow uses the GitHub image sync command", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  assert.match(workflow, /npm run themes:sync-github/);
  assert.match(workflow, /--prune/);
});
