/**
 * @file test-suite/doc.test.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
/**
 * Regression tests for `-doc` — devx -doc [readme|blueprint|scenario|testsuite|setup|testcase]
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs";
import { buildDocTask, DOC_TYPES } from "../src/commands/docTask";

const EXPECTED_OUTPUT_PATH: Record<string, RegExp> = {
  readme: /README\.md/,
  blueprint: /docs\/BLUEPRINT\.md/,
  scenario: /docs\/SCENARIO\.md/,
  testsuite: /docs\/TESTSUITE\.md/,
  setup: /docs\/SETUP\.md/,
  testcase: /docs\/TESTCASES\.md/,
};

test("doc: -doc value is treated as a literal type, never resolved as file content", () => {
  const parsed = parseArgs(["node", "devx", "-doc", "readme"]);
  assert.strictEqual(parsed.values["doc"], "readme");
});

for (const type of DOC_TYPES) {
  test(`doc: "${type}" produces a grounded task targeting the expected output path`, () => {
    const task = buildDocTask(parseArgs(["node", "devx", "-doc", type]));
    assert.match(task, EXPECTED_OUTPUT_PATH[type]);
    assert.match(task, /index_lookup_tool/);
    assert.match(task, /never invent/i);
  });
}

test("doc: unknown type throws a clear error listing valid types", () => {
  assert.throws(
    () => buildDocTask(parseArgs(["node", "devx", "-doc", "bogus"])),
    /Unknown -doc type "bogus".*readme.*blueprint.*scenario.*testsuite.*setup.*testcase/s
  );
});

test("doc: testsuite explicitly requires running the tests, not just writing them", () => {
  const task = buildDocTask(parseArgs(["node", "devx", "-doc", "testsuite"]));
  assert.match(task, /run_command/);
  assert.match(task, /genuine pre-existing bug/i);
});
