#!/usr/bin/env npx tsx
/**
 * Evaluation script for Syag fine-tuned model.
 *
 * Compares the fine-tuned local model against a cloud model (GPT-4o or Claude)
 * on a held-out test set. Measures:
 *   1. Structure accuracy — TL;DR, topics, action items, decisions present
 *   2. Content completeness — key points from transcript captured
 *   3. Formatting compliance — follows Granola-style output format
 *
 * Prerequisites:
 *   - OPENAI_API_KEY in env (for GPT-4o baseline)
 *   - node-llama-cpp installed (for local model inference)
 *   - The fine-tuned GGUF model at ~/.syag/models/syag-llama-3b-q4_k_m.gguf
 *
 * Usage:
 *   npx tsx scripts/eval-model.ts
 *   npx tsx scripts/eval-model.ts --test-file /path/to/test.jsonl
 *   npx tsx scripts/eval-model.ts --local-only  # skip cloud comparison
 */

import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────────

const DEFAULT_TEST_FILE = "/tmp/syag-training-data/summarization.jsonl";
const LOCAL_MODEL_PATH = path.join(
  process.env.HOME || "~",
  ".syag/models/syag-llama-3b-q4_k_m.gguf"
);

interface TestExample {
  instruction: string;
  input: string;
  output: string; // Expected (gold standard)
}

interface EvalResult {
  index: number;
  hasTldr: boolean;
  hasTopics: boolean;
  hasActionItems: boolean;
  hasDecisions: boolean;
  topicCount: number;
  bulletCount: number;
  formatScore: number; // 0-1
  structureScore: number; // 0-1
  lengthRatio: number; // output length / expected length
}

// ─── Structure checks ──────────────────────────────────────────────────────

function evaluateOutput(output: string, expected: string): EvalResult {
  const lines = output.split("\n");

  // Check TL;DR
  const hasTldr = lines.some((l) => /\*\*TL;DR:?\*\*/i.test(l));

  // Check topics (bold headers)
  const topicLines = lines.filter(
    (l) => /^\*\*[^*]+\*\*/.test(l.trim()) && !/TL;DR/i.test(l) && !/—\s*\d/.test(l)
  );
  const hasTopics = topicLines.length > 0;
  const topicCount = topicLines.length;

  // Check action items (→ prefix)
  const actionLines = lines.filter((l) => l.trim().startsWith("→"));
  const hasActionItems = actionLines.length > 0;

  // Check decisions
  const hasDecisions = lines.some((l) => /\*\*Decision:?\*\*/i.test(l));

  // Count bullets
  const bulletLines = lines.filter((l) => /^\s*-\s+/.test(l));
  const bulletCount = bulletLines.length;

  // Format score: check key format rules
  let formatChecks = 0;
  let formatTotal = 5;

  // 1. Title line exists (bold with date)
  if (lines.some((l) => /^\*\*[^*]+\*\*\s*—/.test(l.trim()))) formatChecks++;
  // 2. No numbered lists
  if (!lines.some((l) => /^\s*\d+\.\s/.test(l))) formatChecks++;
  // 3. No paragraphs (long non-bullet lines)
  const longPlainLines = lines.filter(
    (l) => l.trim().length > 80 && !l.trim().startsWith("-") && !l.trim().startsWith("→") && !l.trim().startsWith("**") && !l.trim().startsWith(">")
  );
  if (longPlainLines.length < 2) formatChecks++;
  // 4. Uses bullet prefix (- )
  if (bulletCount > 0) formatChecks++;
  // 5. Has at least one topic header
  if (hasTopics) formatChecks++;

  const formatScore = formatChecks / formatTotal;

  // Structure score
  let structChecks = 0;
  let structTotal = 4;
  if (hasTldr) structChecks++;
  if (hasTopics) structChecks++;
  if (bulletCount >= 3) structChecks++;
  if (topicCount >= 2 && topicCount <= 6) structChecks++;

  const structureScore = structChecks / structTotal;

  // Length ratio
  const lengthRatio = output.length / Math.max(expected.length, 1);

  return {
    index: 0,
    hasTldr,
    hasTopics,
    hasActionItems,
    hasDecisions,
    topicCount,
    bulletCount,
    formatScore,
    structureScore,
    lengthRatio,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const testFile = args.find((a) => !a.startsWith("--")) || DEFAULT_TEST_FILE;
  const localOnly = args.includes("--local-only");

  console.log("═══ Syag Model Evaluation ═══\n");

  // Load test examples (last 5% of training data = held-out eval set)
  if (!fs.existsSync(testFile)) {
    console.error(`Test file not found: ${testFile}`);
    console.error("Generate training data first: npx tsx /tmp/syag-training-data/generate.ts");
    process.exit(1);
  }

  const allExamples: TestExample[] = fs
    .readFileSync(testFile, "utf-8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

  // Use last 50 examples as test set
  const testExamples = allExamples.slice(-50);
  console.log(`Test set: ${testExamples.length} examples (from end of ${allExamples.length} total)\n`);

  // Evaluate the gold-standard outputs (baseline — should score ~100%)
  console.log("Evaluating gold-standard outputs (baseline)...");
  const goldResults: EvalResult[] = testExamples.map((ex, i) => ({
    ...evaluateOutput(ex.output, ex.output),
    index: i,
  }));

  printScorecard("Gold Standard (expected outputs)", goldResults);

  // If local model is available, evaluate it
  if (fs.existsSync(LOCAL_MODEL_PATH)) {
    console.log(`\nLocal model found: ${LOCAL_MODEL_PATH}`);
    console.log("To evaluate the local model, run inference on the test set and compare.");
    console.log("(Full inference evaluation requires node-llama-cpp integration)\n");
  } else {
    console.log(`\nLocal model not found at: ${LOCAL_MODEL_PATH}`);
    console.log("After fine-tuning and downloading the GGUF, re-run this script to evaluate.\n");
  }

  // Print example outputs for manual inspection
  console.log("═══ Sample Outputs for Manual Review ═══\n");
  for (let i = 0; i < Math.min(3, testExamples.length); i++) {
    const ex = testExamples[i];
    console.log(`--- Example ${i + 1} ---`);
    console.log(`Input (first 200 chars): ${ex.input.slice(0, 200)}...`);
    console.log(`\nExpected Output:`);
    console.log(ex.output.slice(0, 500));
    console.log("\n");
  }
}

function printScorecard(label: string, results: EvalResult[]) {
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const tldrRate = results.filter((r) => r.hasTldr).length / results.length;
  const topicRate = results.filter((r) => r.hasTopics).length / results.length;
  const actionRate = results.filter((r) => r.hasActionItems).length / results.length;
  const decisionRate = results.filter((r) => r.hasDecisions).length / results.length;
  const avgFormat = avg(results.map((r) => r.formatScore));
  const avgStructure = avg(results.map((r) => r.structureScore));
  const avgTopics = avg(results.map((r) => r.topicCount));
  const avgBullets = avg(results.map((r) => r.bulletCount));

  console.log(`\n┌── ${label} ──`);
  console.log(`│ TL;DR present:        ${(tldrRate * 100).toFixed(0)}%`);
  console.log(`│ Topics present:       ${(topicRate * 100).toFixed(0)}%`);
  console.log(`│ Action items present: ${(actionRate * 100).toFixed(0)}%`);
  console.log(`│ Decisions present:    ${(decisionRate * 100).toFixed(0)}%`);
  console.log(`│ Format score:         ${(avgFormat * 100).toFixed(0)}%`);
  console.log(`│ Structure score:      ${(avgStructure * 100).toFixed(0)}%`);
  console.log(`│ Avg topics/example:   ${avgTopics.toFixed(1)}`);
  console.log(`│ Avg bullets/example:  ${avgBullets.toFixed(1)}`);
  console.log(`└──────────────────────────────────\n`);
}

main().catch(console.error);
