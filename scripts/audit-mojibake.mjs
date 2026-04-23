import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(repoRoot, "..");

const suspiciousPatterns = [
  /[\u00c3\u00c2\u00c4\u00c6][\u0080-\u00ff]/g,
  /ÃƒÂ¡/g,
  /ÃƒÂ¢/g,
  /ÃƒÂª/g,
  /\uFFFD/g,
];

const allowedMojibakeContext = [
  "repairLatin1Mojibake",
  "QUESTION_MARK_MOJIBAKE_REPLACEMENTS",
  "repairQuestionMarkMojibake",
  "contains_real_mojibake",
  "isSuspiciousText",
  "latin1",
  "utf8",
  "repairMojibake",
];

const websiteTargets = [
  path.join(repoRoot, "src", "lib", "siteConfig.ts"),
  path.join(repoRoot, "src", "lib", "billing.ts"),
  path.join(repoRoot, "src", "lib", "portalApi.ts"),
  path.join(repoRoot, "src", "pages"),
  path.join(repoRoot, "src", "components", "landing"),
  path.join(repoRoot, "src", "components", "features", "pricing"),
  path.join(repoRoot, "src", "components", "shared", "navbar.tsx"),
];

const workflowTargets = [
  path.join(projectRoot, "CaloTrack V18 - Main Workflow - Zalo.json"),
  path.join(projectRoot, "CaloTrack V18 - Chat handle - Zalo.json"),
];

const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md"]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  let text = readText(filePath);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function matchesSuspiciousPattern(value) {
  return suspiciousPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function scanWebsiteFile(filePath, findings) {
  const text = readText(filePath);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!matchesSuspiciousPattern(line)) return;
    const isAllowed = allowedMojibakeContext.some((token) => line.includes(token));
    if (isAllowed) return;
    findings.push({
      scope: "website",
      filePath,
      lineNumber: index + 1,
      context: line.trim(),
    });
  });
}

function walkWebsiteTarget(targetPath, findings) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      walkWebsiteTarget(path.join(targetPath, entry.name), findings);
    }
    return;
  }
  if (!allowedExtensions.has(path.extname(targetPath).toLowerCase())) return;
  scanWebsiteFile(targetPath, findings);
}

function scanWorkflowRealMojibake(workflow, filePath, findings) {
  for (const node of workflow.nodes || []) {
    for (const fieldName of ["jsCode", "jsonBody"]) {
      const value = node?.parameters?.[fieldName];
      if (typeof value !== "string") continue;
      if (fieldName === "jsonBody" && value.includes("QUESTION_MARK_MOJIBAKE_REPLACEMENTS")) {
        continue;
      }
      for (const pattern of suspiciousPatterns) {
        const matches = [...value.matchAll(pattern)];
        for (const match of matches) {
          const index = match.index || 0;
          const context = value.slice(Math.max(0, index - 80), Math.min(value.length, index + 120));
          const isAllowed = allowedMojibakeContext.some((token) => context.includes(token));
          if (isAllowed) continue;
          findings.push({
            scope: "workflow",
            filePath,
            node: node.name,
            fieldName,
            token: match[0],
          });
        }
      }
    }
  }
}

const findings = [];
for (const target of websiteTargets) {
  walkWebsiteTarget(target, findings);
}
for (const target of workflowTargets) {
  if (!fs.existsSync(target)) continue;
  scanWorkflowRealMojibake(readJson(target), target, findings);
}

if (findings.length > 0) {
  console.error("Mojibake audit failed:");
  for (const finding of findings) {
    const relativePath = path.relative(repoRoot, finding.filePath);
    if (finding.scope === "website") {
      console.error(`- ${relativePath}:${finding.lineNumber} ${finding.context}`);
      continue;
    }
    console.error(`- ${relativePath}:${finding.node}:${finding.fieldName}:${finding.token}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      websiteTargets: websiteTargets.map((target) => path.relative(repoRoot, target)),
      workflowTargets: workflowTargets.map((target) => path.relative(repoRoot, target)),
    },
    null,
    2,
  ),
);
