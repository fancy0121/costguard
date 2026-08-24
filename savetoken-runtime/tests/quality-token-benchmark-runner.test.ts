import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateBenchmarkAcceptance,
  loadBenchmarkFixtures,
  resolveBenchmarkModel,
  runQualityTokenBenchmark,
  verifyFrozenBenchmarkInstrument,
} from "../src/benchmark/quality-token";

const fixturePath = join(import.meta.dir, "..", "..", "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-fixtures-v2-2026-08-24.json");
const manifestPath = join(import.meta.dir, "..", "..", "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-instrument-v2-2026-08-24.json");

function response(model: string, text: string, output?: Array<Record<string, unknown>>): Response {
  return Response.json({
    model: model.split("/").at(-1),
    output: output ?? [{ type: "message", content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, output_tokens_details: { reasoning_tokens: 2 } },
  });
}

test("the frozen instrument has two independent fixtures per category and explicit delivery formats", async () => {
  const fixtures = await loadBenchmarkFixtures(fixturePath);
  expect(fixtures).toHaveLength(24);
  expect(fixtures.map((fixture) => fixture.id)).toEqual([
    "EXT-01", "CLS-02", "FMT-03", "SUM-04", "SCH-05", "SCH-06", "TOOL-07", "TOOL-08", "CODE-09", "CODE-10", "TEST-11", "TRA-12",
    "EXT-13", "CLS-14", "FMT-15", "SUM-16", "SCH-17", "SCH-18", "TOOL-19", "TOOL-20", "CODE-21", "CODE-22", "TEST-23", "TRA-24",
  ]);
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    counts.set(fixture.category, (counts.get(fixture.category) ?? 0) + 1);
    expect(fixture.deliveryFormat.length).toBeGreaterThan(0);
  }
  expect([...counts.values()]).toEqual(Array(12).fill(2));
});

test("BENCH_MODEL keeps one explicit safe provider/model route and no fallback", () => {
  expect(resolveBenchmarkModel({})).toBe("deepseek/deepseek-v4-flash");
  expect(resolveBenchmarkModel({ BENCH_MODEL: "openai/gpt-5.6-sol" })).toBe("openai/gpt-5.6-sol");
  expect(() => resolveBenchmarkModel({ BENCH_MODEL: "http://127.0.0.1/model" })).toThrow("benchmark-model-route-invalid");
});

test("the external freeze manifest fails closed before a changed fixture can run", async () => {
  await expect(verifyFrozenBenchmarkInstrument(manifestPath, fixturePath)).resolves.toMatchObject({ instrumentVersion: "quality-token-v2-r1-r5" });
  const root = await mkdtemp(join(tmpdir(), "savetoken-benchmark-freeze-"));
  const changedFixture = join(root, "fixtures.json");
  await writeFile(changedFixture, `${await readFile(fixturePath, "utf8")} `, "utf8");
  await expect(verifyFrozenBenchmarkInstrument(manifestPath, changedFixture)).rejects.toThrow("benchmark-instrument-hash-mismatch");
});

test("R1-R3 evaluate required content while tolerating harmless serialization wrappers", async () => {
  const fixtures = await loadBenchmarkFixtures(fixturePath);
  const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const check = (id: string, text: string, json: Record<string, unknown> = {}, toolUsed = false) => evaluateBenchmarkAcceptance(byId.get(id)!, { text, response: json, toolUsed });

  expect((await check("EXT-01", "```json\n[\"任正非\",\"华为\"]\n```")).pass).toBe(true);
  expect((await check("EXT-13", "提取结果：苹果公司、蒂姆·库克")).pass).toBe(true);
  expect((await check("CLS-02", "```json\n[\"财经\",\"科技\",\"体育\",\"娱乐\",\"财经\",\"科技\",\"体育\",\"娱乐\"]\n```")).pass).toBe(true);
  expect((await check("CLS-14", "1. 体育\n2. 娱乐\n3. 财经\n4. 科技\n5. 体育\n6. 娱乐\n7. 财经\n8. 科技")).pass).toBe(true);
  expect((await check("FMT-03", "```json\n[{\"name\":\"apple\",\"price\":3.5,\"stock\":20},{\"name\":\"banana\",\"price\":2,\"stock\":0}]\n```")).pass).toBe(true);
  expect((await check("FMT-03", '[{"name":"apple"}]')).pass).toBe(false);
  expect((await check("SUM-04", "C919商业航线进入规模化运营")).pass).toBe(true);
  expect((await check("SUM-16", "嫦娥六号完成人类首次月背采样返回")).pass).toBe(true);

  expect((await check("SCH-05", "```json\n{\"name\":\"任意值\",\"count\":12,\"active\":false}\n```")).pass).toBe(true);
  expect((await check("SCH-05", '{"name":"任意值","count":"12","active":false}')).pass).toBe(false);
  expect((await check("SCH-05", '{"name":"任意值","count":12,"active":false,"extra":1}')).pass).toBe(false);
  expect((await check("SCH-06", "```json\n{\"title\":\"书\",\"pages\":10}\n```")).pass).toBe(true);
  expect((await check("SCH-18", '{"sku":"A-1","price":9.5}')).pass).toBe(true);
  expect((await check("SCH-18", '{"sku":"A-1","price":9.5,"extra":true}')).pass).toBe(false);

  expect((await check("TOOL-07", "", { output: [{ type: "function_call", name: "get_weather", arguments: '{"city":"北京"}' }] })).pass).toBe(true);
  expect((await check("TOOL-19", "", { output: [{ type: "function_call", name: "get_weather", arguments: '{"city":"上海"}' }] })).pass).toBe(true);
  expect((await check("TOOL-08", "It is sunny, so going outside is suitable.", {}, true)).pass).toBe(true);
  expect((await check("TOOL-20", "It is rainy, so take an umbrella.", {}, true)).pass).toBe(true);

  expect((await check("CODE-09", "```ts\nfunction isPalindrome(s: string): boolean { const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return cleaned === cleaned.split('').reverse().join(''); }\n```")).pass).toBe(true);
  expect((await check("CODE-21", "function clamp(n: number, min: number, max: number): number { return Math.min(max, Math.max(min, n)); }")).pass).toBe(true);
  expect((await check("CODE-09", "function isPalindrome(_s: string): boolean { return process.env.SECRET === 'x'; }")).detail).toEqual({ outcomes: "code-capability-rejected" });
  expect((await check("CODE-10", "缺陷是 m = 0：全负数数组会错误，因为初始化不应使用零。")).pass).toBe(true);
  expect((await check("CODE-22", "缺陷位于除以 a.length；空数组会发生除以零，应先处理空输入。")).pass).toBe(true);
  expect((await check("TEST-11", "覆盖回文、非回文、空串、标点与大小写。")).pass).toBe(true);
  expect((await check("TEST-23", "覆盖下界、上界、区间内、低于下界、高于上界。")).pass).toBe(true);
  expect((await check("TRA-12", "央行下调存款准备金率以支持信贷。")).pass).toBe(true);
  expect((await check("TRA-24", "该公司将增加研发投入并扩大产能。")).pass).toBe(true);
});

test("one frozen runner evaluates all held-out fixtures and aggregates tokens by category", async () => {
  const fixtures = await loadBenchmarkFixtures(fixturePath);
  const model = "openai/gpt-5.6-sol";
  const requests: Array<Record<string, unknown>> = [];
  const answers = new Map<string, string>([
    ["EXT-01", '["华为","任正非"]'], ["EXT-13", '["苹果公司","蒂姆·库克"]'],
    ["CLS-02", '["财经","科技","体育","娱乐","财经","科技","体育","娱乐"]'], ["CLS-14", '["体育","娱乐","财经","科技","体育","娱乐","财经","科技"]'],
    ["FMT-03", '[{"name":"apple","price":3.5,"stock":20},{"name":"banana","price":2,"stock":0}]'], ["FMT-15", '[{"name":"orange","price":4.2,"stock":8},{"name":"pear","price":5,"stock":3}]'],
    ["SUM-04", "C919商业航线进入规模化运营"], ["SUM-16", "嫦娥六号完成人类首次月背采样返回"],
    ["SCH-05", '{"name":"beta","count":12,"active":false}'], ["SCH-17", '{"title":"计划","items":3,"archived":false}'],
    ["SCH-06", '{"title":"书","pages":10}'], ["SCH-18", '{"sku":"A-1","price":9.5}'],
    ["CODE-09", "function isPalindrome(s: string): boolean { const cleaned = s.toLowerCase().replace(/[^a-z0-9]/g, ''); return cleaned === cleaned.split('').reverse().join(''); }"],
    ["CODE-21", "function clamp(n: number, min: number, max: number): number { return Math.min(max, Math.max(min, n)); }"],
    ["CODE-10", "缺陷是 m = 0：全负数数组会错误，因为初始化不应使用零。"], ["CODE-22", "缺陷位于除以 a.length；空数组会发生除以零，应先处理空输入。"],
    ["TEST-11", "覆盖回文、非回文、空串、标点与大小写。"], ["TEST-23", "覆盖下界、上界、区间内、低于下界、高于上界。"],
    ["TRA-12", "央行下调存款准备金率以支持信贷。"], ["TRA-24", "该公司将增加研发投入并扩大产能。"],
  ]);
  const idByInput = new Map(fixtures.map((fixture) => [fixture.input, fixture.id]));
  const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    expect(body.model).toBe(model);
    expect(body).not.toHaveProperty("acceptance");
    if (Array.isArray(body.input)) {
      const serialized = JSON.stringify(body.input);
      return response(model, serialized.includes("call-20") ? "It is rainy, so take an umbrella." : "It is sunny, so going outside is suitable.");
    }
    const id = idByInput.get(String(body.input));
    if (id === "TOOL-07" || id === "TOOL-19") {
      const city = id === "TOOL-07" ? "北京" : "上海";
      return response(model, "", [{ type: "function_call", call_id: `call-${id}`, name: "get_weather", arguments: JSON.stringify({ city }) }]);
    }
    if (id === "TOOL-08" || id === "TOOL-20") {
      const city = id === "TOOL-08" ? "巴黎" : "罗马";
      const callId = id === "TOOL-08" ? "call-8" : "call-20";
      return response(model, "", [{ type: "function_call", call_id: callId, name: "get_weather", arguments: JSON.stringify({ city }) }]);
    }
    return response(model, answers.get(id ?? "") ?? "");
  };

  const evidence = await runQualityTokenBenchmark({ fixturePath, model, proxyBaseUrl: "http://127.0.0.1:10100", fetchImpl, date: "2026-08-24" });
  expect(evidence.taskCount).toBe(24);
  expect(evidence.passCount).toBe(24);
  expect(evidence.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(evidence.evaluatorSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(evidence.categorySummaries).toHaveLength(12);
  expect(evidence.categorySummaries.every((category) => category.taskCount === 2 && category.passCount === 2)).toBe(true);
  expect(evidence.categorySummaries.find((category) => category.category === "tool-multi-turn")?.usage).toEqual({ inputTokens: 40, outputTokens: 20, reasoningTokens: 8, totalTokens: 60 });
  expect(requests).toHaveLength(26);
});

test("response identity mismatch stays UNKNOWN at both task and category levels", async () => {
  const evidence = await runQualityTokenBenchmark({ fixturePath, model: "openai/gpt-5.6-sol", proxyBaseUrl: "http://127.0.0.1:10100", date: "2026-08-24", fetchImpl: async () => response("deepseek/deepseek-v4-flash", "irrelevant") });
  expect(evidence.passCount).toBe(0);
  expect(evidence.missingCount).toBe(0);
  expect(evidence.unknownCount).toBe(24);
  expect(evidence.categorySummaries.every((category) => category.unknownCount === 2 && category.passCount === 0)).toBe(true);
});
