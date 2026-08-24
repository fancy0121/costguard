import { describe, expect, test } from "bun:test";
import { decideRoute } from "../src/routing/route";

describe("SaveToken routing", () => {
  test("routes security work to Sol and closes on Sol unavailability", () => {
    const decision = decideRoute({
      text: "rotate credentials and repair the authentication boundary",
      hasSecurityOrPermissionImpact: true,
    });

    expect(decision.tier).toBe("sol");
    expect(decision.candidates).toEqual(["gpt-5.6-sol"]);
    expect(decision.failClosed).toBe(true);
    expect(decision.escalationReasons).toContain("security-or-permission-impact");
  });

  test("routes bounded repetitive file work to the execution tier", () => {
    const decision = decideRoute({
      text: "extract the title and date from each markdown file",
      filesChanged: 20,
      isBatchOrRepetitive: true,
      isToolOrFileExecution: true,
    });

    expect(decision.tier).toBe("execution");
    expect(decision.candidates).toContain("deepseek-v4-flash");
    expect(decision.failClosed).toBe(false);
  });

  test("does not downgrade Chinese high-risk text to execution", () => {
    const decision = decideRoute({
      text: "process security permission and authentication configuration",
      isBatchOrRepetitive: true,
      isToolOrFileExecution: true,
    });

    expect(decision.tier).toBe("sol");
    expect(decision.candidates).toEqual(["gpt-5.6-sol"]);
    expect(decision.failClosed).toBe(true);
  });

  test("recognizes actual Chinese production and permission text without relying on source encoding", () => {
    const decision = decideRoute({
      text: "\u751f\u4ea7\u73af\u5883\u6743\u9650\u8fc1\u79fb\u9700\u8981\u5ba1\u6838",
      isBatchOrRepetitive: true,
      isToolOrFileExecution: true,
    });

    expect(decision.tier).toBe("sol");
    expect(decision.failClosed).toBe(true);
    expect(decision.escalationReasons).toContain("security-or-permission-impact");
  });

  test("does not treat cross-module batch work as execution-tier work", () => {
    const decision = decideRoute({
      text: "update the bounded implementation across several modules",
      modulesTouched: 3,
      isBatchOrRepetitive: true,
      isToolOrFileExecution: true,
    });

    expect(decision.tier).toBe("terra");
    expect(decision.failClosed).toBe(true);
  });

  test("escalates underspecified work to Terra instead of guessing", () => {
    const decision = decideRoute({ text: "make this better" });

    expect(decision.tier).toBe("terra");
    expect(decision.candidates).toEqual(["gpt-5.6-terra"]);
    expect(decision.failClosed).toBe(true);
    expect(decision.escalationReasons).toContain("insufficient-task-signals");
  });
});
