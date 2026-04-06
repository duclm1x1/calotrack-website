import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(repoRoot, "..");

const workflowFiles = [
  path.join(repoRoot, "tmp", "main-live-current.json"),
  path.join(repoRoot, "tmp", "chat-live-current.json"),
  path.join(projectRoot, "CaloTrack V18 - Main Workflow - Zalo.json"),
  path.join(projectRoot, "CaloTrack V18 - Chat handle - Zalo.json"),
];

const SUSPICIOUS_MOJIBAKE = [
  /[\u00c3\u00c2\u00c4\u00c6][\u0080-\u00ff]/g,
  /Ã¡/g,
  /Ã¢/g,
  /Ãª/g,
  /\uFFFD/g,
];

const ALLOWED_MOJIBAKE_CONTEXT = [
  "repairLatin1Mojibake",
  "QUESTION_MARK_MOJIBAKE_REPLACEMENTS",
  "repairQuestionMarkMojibake",
  "contains_real_mojibake",
  "isSuspiciousText",
  "latin1",
  "utf8",
  "repairMojibake",
];

function readJson(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, (char) => (char === "đ" ? "d" : "D"))
    .toLowerCase()
    .trim();
}

function requireNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`node_not_found:${workflow.name}:${name}`);
  return node;
}

function requireNodeByNormalizedName(workflow, normalizedName) {
  const node = (workflow.nodes || []).find(
    (item) => normalizeName(item.name) === normalizedName,
  );
  if (!node) throw new Error(`node_not_found:${workflow.name}:${normalizedName}`);
  return node;
}

function optionalNode(workflow, name) {
  return (workflow.nodes || []).find((item) => item.name === name) || null;
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

function getMainOutputs(workflow, nodeName) {
  return workflow.connections?.[nodeName]?.main || [];
}

function hasMainConnection(workflow, fromName, outputIndex, toName) {
  const output = getMainOutputs(workflow, fromName)[outputIndex] || [];
  return output.some((edge) => edge.node === toName && edge.type === "main");
}

function compileCodeNodes(filePath, workflow, failures) {
  for (const node of workflow.nodes || []) {
    const jsCode = node?.parameters?.jsCode;
    if (typeof jsCode !== "string" || !jsCode.trim()) continue;
    try {
      new vm.Script(`(async function(){\n${jsCode}\n})`, {
        filename: `${path.basename(filePath)}:${node.name}`,
      });
    } catch (error) {
      failures.push(`${path.basename(filePath)}:${node.name}:code_compile_failed:${error.message}`);
    }
  }
}

function scanRealMojibake(workflow) {
  const findings = [];
  for (const node of workflow.nodes || []) {
    for (const fieldName of ["jsCode", "jsonBody"]) {
      const value = node?.parameters?.[fieldName];
      if (typeof value !== "string") continue;
      if (fieldName === "jsonBody" && value.includes("QUESTION_MARK_MOJIBAKE_REPLACEMENTS")) continue;
      for (const pattern of SUSPICIOUS_MOJIBAKE) {
        const matches = [...value.matchAll(pattern)];
        for (const match of matches) {
          const index = match.index || 0;
          const context = value.slice(Math.max(0, index - 80), Math.min(value.length, index + 120));
          const isAllowed = ALLOWED_MOJIBAKE_CONTEXT.some((token) => context.includes(token));
          if (!isAllowed) {
            findings.push({
              node: node.name,
              field: fieldName,
              token: match[0],
            });
          }
        }
      }
    }
  }
  return findings;
}

function inspectSendNode(filePath, workflow, nodeName, failures) {
  const node = optionalNode(workflow, nodeName);
  if (!node) return;
  assert(
    node.parameters?.url === "https://calotrack-website.vercel.app/api/zalo-oa-send-cs",
    `${path.basename(filePath)}:${nodeName}:url_not_brokered`,
    failures,
  );
  assert(
    JSON.stringify(node.parameters?.headerParameters?.parameters || []).includes("x-calotrack-internal-key"),
    `${path.basename(filePath)}:${nodeName}:missing_internal_key_header`,
    failures,
  );
  assert(
    String(node.parameters?.jsonBody || "").includes("QUESTION_MARK_MOJIBAKE_REPLACEMENTS"),
    `${path.basename(filePath)}:${nodeName}:missing_outbound_mojibake_guard`,
    failures,
  );
  assert(
    !String(node.parameters?.url || "").includes("openapi.zalo.me"),
    `${path.basename(filePath)}:${nodeName}:stale_direct_zalo_url`,
    failures,
  );
}

function inspectMainWorkflow(filePath, workflow, failures) {
  for (const nodeName of ["Send Final Response", "Send Final Response1"]) {
    inspectSendNode(filePath, workflow, nodeName, failures);
  }

  const nutrition = requireNode(workflow, "AI Estimate Nutrition2");
  assert(
    nutrition.parameters?.url === "https://calotrack-website.vercel.app/api/zalo-nutrition-estimate",
    `${path.basename(filePath)}:AI Estimate Nutrition2:url_not_typed_api`,
    failures,
  );
  const nutritionHeaders = JSON.stringify(nutrition.parameters?.headerParameters?.parameters || []);
  assert(
    nutritionHeaders.includes("x-calotrack-internal-key"),
    `${path.basename(filePath)}:AI Estimate Nutrition2:missing_internal_key`,
    failures,
  );
  assert(
    nutritionHeaders.includes("x-calotrack-ai-authorization"),
    `${path.basename(filePath)}:AI Estimate Nutrition2:missing_ai_authorization`,
    failures,
  );
  assert(
    nutrition.onError === "continueErrorOutput",
    `${path.basename(filePath)}:AI Estimate Nutrition2:error_output_disabled`,
    failures,
  );
  assert(
    hasMainConnection(workflow, "AI Estimate Nutrition2", 0, "Parse AI Response"),
    `${path.basename(filePath)}:AI Estimate Nutrition2:missing_success_parse_connection`,
    failures,
  );
  assert(
    hasMainConnection(workflow, "AI Estimate Nutrition2", 1, "Parse AI Response"),
    `${path.basename(filePath)}:AI Estimate Nutrition2:missing_error_parse_connection`,
    failures,
  );

  const parseAi = String(requireNode(workflow, "Parse AI Response").parameters?.jsCode || "");
  assert(parseAi.includes("typedNutritionPayload"), `${path.basename(filePath)}:Parse AI Response:missing_typed_prefix`, failures);
  assert(parseAi.includes("food_log_insert_allowed"), `${path.basename(filePath)}:Parse AI Response:missing_insert_guard`, failures);
  assert(parseAi.includes("typedNutritionPayload.status"), `${path.basename(filePath)}:Parse AI Response:missing_status_mapping`, failures);

  const foodInsertGate = JSON.stringify(requireNode(workflow, "Food Log Insert Allowed?").parameters || {});
  assert(foodInsertGate.includes("total_calories"), `${path.basename(filePath)}:Food Log Insert Allowed?:missing_nonzero_guard`, failures);

  const formatFood = String(requireNode(workflow, "Format AI Response - LOG FOOD").parameters?.jsCode || "");
  assert(formatFood.includes("typedFoodSkipPayload"), `${path.basename(filePath)}:Format AI Response - LOG FOOD:missing_skip_prefix`, failures);

  const weeklyGate = JSON.stringify(requireNode(workflow, "Is Weekly Stats?").parameters || {});
  assert(weeklyGate.includes("monthly_stats"), `${path.basename(filePath)}:Is Weekly Stats?:missing_monthly_support`, failures);

  const summaryNode = requireNode(workflow, "Get Canonical Period Summary");
  assert(
    summaryNode.parameters?.url === "https://calotrack-website.vercel.app/api/zalo-summary",
    `${path.basename(filePath)}:Get Canonical Period Summary:url_not_typed_api`,
    failures,
  );
  assert(
    hasMainConnection(workflow, "Is Weekly Stats?", 0, "Get Canonical Period Summary"),
    `${path.basename(filePath)}:Is Weekly Stats?:missing_period_summary_connection`,
    failures,
  );
  assert(
    hasMainConnection(workflow, "Get Canonical Period Summary", 0, "Format Weekly Summary"),
    `${path.basename(filePath)}:Get Canonical Period Summary:missing_formatter_connection`,
    failures,
  );
}

function inspectChatWorkflow(filePath, workflow, failures) {
  for (const nodeName of ["Send Chat Response", "Send Chat Response3", "Send Blocked Message1", "Send Spam Warning"]) {
    inspectSendNode(filePath, workflow, nodeName, failures);
  }

  const imageNode = requireNodeByNormalizedName(workflow, "phan tich hinh anh ai");
  assert(
    imageNode.parameters?.url === "https://calotrack-website.vercel.app/api/zalo-image-analyze",
    `${path.basename(filePath)}:${imageNode.name}:url_not_typed_api`,
    failures,
  );
  const imageHeaders = JSON.stringify(imageNode.parameters?.headerParameters?.parameters || []);
  assert(
    imageHeaders.includes("x-calotrack-internal-key"),
    `${path.basename(filePath)}:${imageNode.name}:missing_internal_key`,
    failures,
  );
  assert(
    imageHeaders.includes("x-calotrack-ai-authorization"),
    `${path.basename(filePath)}:${imageNode.name}:missing_ai_authorization`,
    failures,
  );
  assert(
    imageNode.onError === "continueErrorOutput",
    `${path.basename(filePath)}:${imageNode.name}:error_output_disabled`,
    failures,
  );
  assert(
    hasMainConnection(workflow, imageNode.name, 0, "Parse Image Analysis"),
    `${path.basename(filePath)}:${imageNode.name}:missing_success_parse_connection`,
    failures,
  );
  assert(
    hasMainConnection(workflow, imageNode.name, 1, "Parse Image Analysis"),
    `${path.basename(filePath)}:${imageNode.name}:missing_error_parse_connection`,
    failures,
  );

  assert(
    !workflow.connections?.["Image Analyze"],
    `${path.basename(filePath)}:Image Analyze:stale_ai_language_model_connection`,
    failures,
  );

  const parseImage = String(requireNode(workflow, "Parse Image Analysis").parameters?.jsCode || "");
  assert(parseImage.includes("typedImagePayload"), `${path.basename(filePath)}:Parse Image Analysis:missing_typed_prefix`, failures);
  assert(parseImage.includes("image_review_ready"), `${path.basename(filePath)}:Parse Image Analysis:missing_review_ready_status`, failures);
  assert(parseImage.includes("inbody_review_ready"), `${path.basename(filePath)}:Parse Image Analysis:missing_inbody_ready_status`, failures);

  const gatekeeper = String(requireNode(workflow, "Gatekeeper V18").parameters?.jsCode || "");
  assert(gatekeeper.includes("image_size_clarification"), `${path.basename(filePath)}:Gatekeeper V18:missing_image_size_followup`, failures);
  assert(gatekeeper.includes("directGymTargetKey"), `${path.basename(filePath)}:Gatekeeper V18:missing_gym_target_alias`, failures);

  const prepareDirect = String(requireNode(workflow, "Prepare_Direct_Response").parameters?.jsCode || "");
  assert(prepareDirect.includes("image_size_clarification"), `${path.basename(filePath)}:Prepare_Direct_Response:missing_image_size_handler`, failures);
  assert(prepareDirect.includes("return 1.25"), `${path.basename(filePath)}:Prepare_Direct_Response:missing_size_scaling`, failures);
}

function main() {
  const failures = [];

  for (const filePath of workflowFiles) {
    const workflow = readJson(filePath);
    compileCodeNodes(filePath, workflow, failures);

    if (workflow.name.includes("Main Workflow")) {
      inspectMainWorkflow(filePath, workflow, failures);
    } else {
      inspectChatWorkflow(filePath, workflow, failures);
    }

    const findings = scanRealMojibake(workflow);
    for (const finding of findings) {
      failures.push(`${path.basename(filePath)}:${finding.node}:${finding.field}:${finding.token}:real_mojibake_detected`);
    }
  }

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        files: workflowFiles,
        checks: [
          "broker_send_urls",
          "outbound_mojibake_guard",
          "code_node_compile",
          "typed_nutrition_api",
          "typed_image_api",
          "period_summary_api",
          "food_insert_guard",
          "image_size_followup",
          "gym_target_alias",
          "real_mojibake_scan",
        ],
      },
      null,
      2,
    ),
  );
}

main();
