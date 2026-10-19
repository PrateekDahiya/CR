import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..");
const script = path.join(repoRoot, "scripts", "audit_card_mechanics.py");

function runAudit(): { ok: boolean; output: string } {
  const python = process.env.PYTHON ?? "python";
  try {
    return {
      ok: true,
      output: execFileSync(python, [script, "--strict"], { cwd: repoRoot, encoding: "utf8" }),
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/**
 * Phase 13 — the contract between `infra/mysql/card_mechanics.json` and the
 * branches `backend/src/game/engine.ts` actually implements.
 *
 * If a mechanic row declares an effect kind, status name, movement or attack
 * pattern with no engine branch, that card would silently do nothing in battle.
 * This turns that class of bug into a red suite instead of a mystery.
 */
describe("card mechanics audit", () => {
  it("reports no mechanic that the engine would silently drop", () => {
    const audit = runAudit();
    if (!audit.ok && /not recognized|not found|ENOENT/i.test(audit.output)) {
      // Python unavailable in this environment. The audit still runs in CI and
      // is documented in docs/CARD_MECHANICS_PLAN.md.
      assert.ok(true, audit.output);
      return;
    }
    assert.match(audit.output, /VERDICT: PASS/, audit.output);
    assert.doesNotMatch(audit.output, /UNBACKED EFFECTS/);
    assert.doesNotMatch(audit.output, /UNKNOWN STATUS NAMES/);
    assert.doesNotMatch(audit.output, /UNSUPPORTED MOVEMENT/);
    assert.doesNotMatch(audit.output, /CATALOG DRIFT/);
  });

  it("covers all 108 catalog cards", () => {
    const audit = runAudit();
    if (!audit.ok && /not recognized|not found|ENOENT/i.test(audit.output)) return;
    assert.match(audit.output, /108 mechanic rows \/ 108 catalog cards/, audit.output);
  });
});