import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/fixtures/market-rss-translation-review.json");

try {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (fixture?.schemaVersion !== 1 || !Array.isArray(fixture.cases)) {
    throw new Error("fixture schemaVersion/cases 형식이 올바르지 않습니다.");
  }
  if (fixture.cases.length === 0) {
    console.error("RSS translation semantic coverage is missing: add at least one human-reviewed case to lib/fixtures/market-rss-translation-review.json.");
    process.exitCode = 1;
  } else {
    console.log(`RSS translation semantic coverage OK: ${fixture.cases.length} human-reviewed case(s).`);
  }
} catch (error) {
  console.error(`RSS translation coverage check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
