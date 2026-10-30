import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const docsRoot = join(root, "docs");
const catalogPath = join(root, "public", "document-catalog.json");
const manualsRoot = join(root, "public", "manuals");
const apiReferencePath = join(root, "public", "api-reference.md");
const llmsPath = join(root, "public", "llms.txt");
const docsIndexPath = join(docsRoot, "README.md");
const allowedExtensions = new Set([".md", ".json"]);
const excludedSegments = new Set(["scratch", "__pycache__", "debug-history"]);
const excludedFiles = new Set(["DEVELOPMENT_LOG.md", "route-inventory.json"]);

function normalizePath(path) {
  return path.split(sep).join("/");
}

function titleFromContent(content, path) {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (title) return title;
  const name = basename(path, extname(path)).replace(/[-_]/g, " ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function descriptionFromContent(content, title, path) {
  const explicit = content.match(/^<!--\s*catalog-description:\s*(.+?)\s*-->$/m)?.[1]?.trim();
  if (explicit) return explicit;
  const lines = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "").split(/\r?\n/);
  const paragraph = lines.find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("|") && !trimmed.startsWith("-") && !trimmed.startsWith("*") && !trimmed.startsWith("`") && !trimmed.startsWith(">") && !trimmed.startsWith("[");
  });
  if (paragraph) return paragraph.replace(/[`*_]/g, "").replace(/\[[^\]]+\]\([^)]+\)/g, "$1").slice(0, 360);
  return `${title} 문서입니다. 세부 내용과 적용 범위는 원문을 확인하세요. (${path})`;
}

function categoryFor(path) {
  const parts = path.split("/");
  if (parts[0] === "architecture") return "architecture";
  if (parts[0] === "development") return "development";
  if (parts[0] === "operations") return "operations";
  if (parts[0] === "references" || parts[0] === "official") return "reference";
  if (parts[0] === "company-analysis") return "company-analysis";
  if (parts[0] === "api") return "api";
  return "project-guide";
}

function collectMarkdownLinks(content, path) {
  const links = [];
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split(/[?#]/, 1)[0];
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/") || !allowedExtensions.has(extname(target).toLowerCase())) continue;
    const resolved = normalizePath(relative(root, resolve(docsRoot, dirname(path), target)));
    if (existsSync(join(root, resolved))) links.push(resolved);
  }
  return [...new Set(links)];
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const fullPath = join(directory, entry.name);
    const relativePath = normalizePath(relative(docsRoot, fullPath));
    if (entry.isDirectory()) {
      if (excludedSegments.has(entry.name)) continue;
      files.push(...await walk(fullPath));
      continue;
    }
    if (!entry.isFile() || !allowedExtensions.has(extname(entry.name).toLowerCase())) continue;
    if (excludedFiles.has(entry.name) || entry.name.toLowerCase().includes("template")) continue;
    if (entry.name.match(/(?:^|\D)20\d{2}[-_]?(?:0[1-9]|1[0-2])[-_]?(?:0[1-9]|[12]\d|3[01])(?:\D|$)/) && !/runbook|design|standard|schema|template/i.test(entry.name)) continue;
    if (extname(entry.name).toLowerCase() === ".json" && !/(?:schema|template|route-inventory)/i.test(entry.name)) continue;
    const details = await stat(fullPath);
    if (details.size > 300_000) continue;
    files.push({ fullPath, relativePath });
  }
  return files;
}

async function buildCatalog() {
  const files = await walk(docsRoot);
  const eligiblePaths = new Set(files.map((file) => normalizePath(relative(root, file.fullPath))));
  const entries = [];
  for (const file of files) {
    const content = await readFile(file.fullPath, "utf8");
    const path = file.relativePath;
    const title = titleFromContent(content, path);
    entries.push({
      id: path.replace(/\.(?:md|json)$/i, "").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase(),
      title,
      category: categoryFor(path),
      format: extname(path).slice(1).toLowerCase(),
      description: descriptionFromContent(content, title, path).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
      url: `/manuals/${path.split("/").map(encodeURIComponent).join("/")}`,
      relatedPaths: collectMarkdownLinks(content, path).filter((related) => eligiblePaths.has(related)),
      sourcePath: `docs/${path}`,
    });
  }
  entries.sort((a, b) => a.category.localeCompare(b.category, "en") || a.sourcePath.localeCompare(b.sourcePath, "en"));
  const entriesByPath = new Map(entries.map((entry) => [entry.sourcePath, entry]));
  for (const entry of entries) {
    entry.related = entry.relatedPaths.flatMap((path) => {
      const related = entriesByPath.get(path);
      return related ? [{ title: related.title, url: related.url, sourcePath: related.sourcePath }] : [];
    });
  }
  const categories = [
    { id: "architecture", title: "아키텍처·기능 설계", description: "시스템 구조, 모듈 책임과 기능별 설계" },
    { id: "development", title: "개발 규칙", description: "구현·테스트·마이그레이션 및 전달 기준" },
    { id: "operations", title: "운영·장애 대응", description: "배포·스케줄·데이터 갱신·분석 runbook" },
    { id: "api", title: "API 문서", description: "API 호출 계약과 외부 공식 문서" },
    { id: "reference", title: "공식 자료·참고", description: "KIS, SEC, DART 등 원문 및 출처 기록" },
    { id: "company-analysis", title: "기업 분석", description: "기업별 분석과 티커·사건 인덱스" },
    { id: "project-guide", title: "프로젝트 안내·현황", description: "문서 인덱스, 시스템 기준과 프로젝트별 지침" },
  ];
  return {
    schemaVersion: "stockman-document-catalog.v1",
    entrypoint: "/llms.txt",
    searchEndpoint: "/api/public/document-catalog",
    apiManual: "/api/public/api-manual",
    fullCatalog: "/document-catalog.json",
    documentationIndex: "/manuals/README.md",
    usage: {
      strategy: "Read this small catalog first. Select documents by task, then fetch only their URLs. Do not load every document by default.",
      documentQuery: "GET /api/public/document-catalog?q=keyword&category=operations&limit=10",
      apiQuery: "GET /api/public/api-manual?q=keyword&category=screeners&limit=10",
      responseFields: ["id", "title", "category", "format", "description", "url", "related", "relatedPaths", "sourcePath"],
      pagination: "Use cursor from the previous response to fetch the next page. Search q and category are preserved in the cursor scope.",
    },
    categories,
    documentCount: entries.length,
    documents: entries,
  };
}

const mode = process.argv[2] ?? "check";
const catalog = await buildCatalog();
const failures = [];
if (catalog.documents.length < 50) failures.push(`Expected at least 50 tracked documents; found ${catalog.documents.length}.`);
const ids = catalog.documents.map((document) => document.id);
if (ids.some((id, index) => ids.indexOf(id) !== index)) failures.push("Document IDs are not unique.");
for (const document of catalog.documents) {
  if (!document.description || document.description.length > 360) failures.push(`${document.sourcePath}: missing or oversized description.`);
  if (!existsSync(join(root, document.sourcePath))) failures.push(`${document.sourcePath}: source file is missing.`);
  for (const related of document.related) if (!catalog.documents.some((candidate) => candidate.sourcePath === related.sourcePath && candidate.url === related.url)) failures.push(`${document.sourcePath}: related document ${related.sourcePath} is not indexed.`);
}
for (const [requiredPath, requiredText] of [
  [docsIndexPath, "/document-catalog.json"],
  [apiReferencePath, "/document-catalog.json"],
  [llmsPath, "/document-catalog.json"],
]) {
  const body = await readFile(requiredPath, "utf8");
  if (!body.includes(requiredText)) failures.push(`${normalizePath(relative(root, requiredPath))}: must link to ${requiredText}.`);
}
if (mode === "write") {
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  let previousPaths = [];
  try {
    const previous = JSON.parse(await readFile(catalogPath, "utf8"));
    previousPaths = (previous.documents ?? []).map((document) => document.sourcePath).filter((path) => typeof path === "string");
  } catch {}
  const currentPaths = new Set(catalog.documents.map((document) => document.sourcePath));
  for (const sourcePath of previousPaths) {
    if (currentPaths.has(sourcePath)) continue;
    const relativePath = sourcePath.replace(/^docs[\\/]/, "");
    const target = resolve(manualsRoot, relativePath);
    if (!target.startsWith(`${manualsRoot}${sep}`)) continue;
    try { await unlink(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const document of catalog.documents) {
    const relativePath = document.sourcePath.replace(/^docs[\\/]/, "");
    const target = join(manualsRoot, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(root, document.sourcePath), "utf8"), "utf8");
  }
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Wrote ${catalog.documents.length} documents across ${catalog.categories.length} categories and published them under public/manuals/.`);
  process.exit(0);
}
if (mode !== "check") {
  console.error("Usage: node docs/api/document-catalog.mjs [write|check]");
  process.exit(2);
}
let current;
try {
  current = JSON.parse(await readFile(catalogPath, "utf8"));
} catch (error) {
  failures.push(`public/document-catalog.json is missing or invalid; run npm run docs:catalog:generate (${error.message}).`);
}
if (current && JSON.stringify(current) !== JSON.stringify(catalog)) failures.push("public/document-catalog.json is stale; run npm run docs:catalog:generate and review the changes.");
for (const document of catalog.documents) {
  const publishedPath = join(manualsRoot, document.sourcePath.replace(/^docs[\\/]/, ""));
  if (!existsSync(publishedPath)) failures.push(`${document.sourcePath}: published manual is missing at ${normalizePath(relative(root, publishedPath))}.`);
  else if (await readFile(publishedPath, "utf8") !== await readFile(join(root, document.sourcePath), "utf8")) failures.push(`${document.sourcePath}: published manual is stale.`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Document catalog OK (${catalog.documents.length} documents, ${catalog.categories.length} categories).`);
