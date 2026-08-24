import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveBenchmarkModel, runQualityTokenBenchmark, verifyFrozenBenchmarkInstrument } from "../src/benchmark/quality-token";

const model = resolveBenchmarkModel(process.env);
const date = process.env.BENCH_DATE?.trim() || new Date().toISOString().slice(0, 10);
const root = join(import.meta.dir, "..", "..");
const fixturePath = join(root, "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-fixtures-v2-2026-08-24.json");
const manifestPath = join(root, "docs", "superpowers", "evidence", "savetoken-quality-token-benchmark-instrument-v2-2026-08-24.json");
await verifyFrozenBenchmarkInstrument(manifestPath, fixturePath);
const evidence = await runQualityTokenBenchmark({ fixturePath, model, proxyBaseUrl: "http://127.0.0.1:10100", date });
const outputDir = join(root, "docs", "superpowers", "evidence");
const slug = model.replace(/[^A-Za-z0-9._-]+/g, "-");
const outputPath = join(outputDir, `savetoken-quality-token-benchmark-${slug}-${date}.json`);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ model, reasoningEffort: evidence.reasoningEffort, taskCount: evidence.taskCount, passCount: evidence.passCount, missingCount: evidence.missingCount, unknownCount: evidence.unknownCount, outputPath }, null, 2));
process.exitCode = evidence.unknownCount > 0 ? 2 : evidence.missingCount > 0 ? 1 : 0;
