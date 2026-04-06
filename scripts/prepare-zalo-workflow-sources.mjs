import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const projectRoot = path.resolve(repoRoot, "..");

const rawMainPath = path.join(repoRoot, "tmp", "live-main-current-from-api.json");
const rawChatPath = path.join(repoRoot, "tmp", "live-chat-current-from-api.json");
const preparedMainPath = path.join(repoRoot, "tmp", "main-live-current.json");
const preparedChatPath = path.join(repoRoot, "tmp", "chat-live-current.json");
const rootMainPath = path.join(projectRoot, "CaloTrack V18 - Main Workflow - Zalo.json");
const rootChatPath = path.join(projectRoot, "CaloTrack V18 - Chat handle - Zalo.json");

function readJson(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function findNode(workflow, name) {
  return (workflow.nodes || []).find((item) => item.name === name) || null;
}

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`replace_marker_missing:${label}`);
  }
  return source.replace(before, after);
}

function replaceRegex(source, pattern, replacer, label) {
  if (!pattern.test(source)) {
    throw new Error(`replace_marker_missing:${label}`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacer);
}

function prependOnce(source, marker, prefix) {
  return source.includes(marker) ? source : `${prefix}${source}`;
}

function extractInternalKey(workflow) {
  for (const nodeName of [
    "Send Final Response",
    "Send Final Response1",
    "Send Chat Response",
    "Send Spam Warning",
  ]) {
    const node = findNode(workflow, nodeName);
    const headers = node?.parameters?.headerParameters?.parameters || [];
    const match = headers.find((item) => item.name === "x-calotrack-internal-key");
    if (match?.value) return match.value;
  }
  throw new Error("internal_key_not_found");
}

function extractAiAuth(mainWorkflow) {
  const node = requireNode(mainWorkflow, "AI Estimate Nutrition2");
  const headers = node.parameters?.headerParameters?.parameters || [];
  return headers.find((item) => item.name === "Authorization")?.value || "";
}

function extractAiEndpoint(mainWorkflow) {
  return String(requireNode(mainWorkflow, "AI Estimate Nutrition2").parameters?.url || "").trim();
}

function buildNutritionJsonBody() {
  return `={{ ({
  trace_id: $('AI Estimate Food1').first().json.trace_id || $json.trace_id || null,
  source_message_id: $('AI Estimate Food1').first().json.source_message_id || $json.source_message_id || null,
  user_id: $('AI Estimate Food1').first().json.user_id_db || $('AI Estimate Food1').first().json.user_id || $json.user_id_db || $json.user_id || null,
  message_text: $('AI Estimate Food1').first().json.source_message_text || $('AI Estimate Food1').first().json.message_text || $('AI Estimate Food1').first().json.current_message_text || $json.ai_prompt || '',
  food_name: $('AI Estimate Food1').first().json.food_name || $json.food_name || null,
  quantity: $('AI Estimate Food1').first().json.quantity || $json.quantity || null,
  context: $('AI Estimate Food1').first().json || {}
}) }}`;
}

function buildSummaryJsonBody() {
  return `={{ ({
  trace_id: $json.trace_id || null,
  source_message_id: $json.source_message_id || null,
  user_id: $json.user_id_db || $json.user_id || null,
  linkedUserId: $json.user_id_db || $json.user_id || null,
  customerId: $json.user_record?.customer_id || $json.customer_id || null,
  period: $('Validate Query Params').first().json.query_type === 'monthly_stats' ? 'month' : 'week'
}) }}`;
}

function buildImageJsonBody() {
  return `={{ ({
  trace_id: $json.trace_id || null,
  source_message_id: $json.source_message_id || $json.message_id || null,
  user_id: $json.user_id_db || $json.user_id || $json.user_record?.id || null,
  caption: $json.caption_text || $json.caption || $json.message_text || $json.current_message_text || '',
  caption_text: $json.caption_text || '',
  message_text: $json.message_text || $json.current_message_text || '',
  current_message_text: $json.current_message_text || $json.message_text || '',
  image_data_url: $json.image_data_url || null,
  image_url: $json.image_url || null,
  image_mime_type: $json.image_mime_type || null,
  mode_hint: $json.mode_hint || null,
  pending_intent: $json.updated_pending_intent || $json.pending_intent || $json.user_record?.pending_intent || {},
  user_record: $json.user_record || {}
}) }}`;
}

function configureInternalHttpNode(node, url, internalKey, aiAuth, aiEndpoint, jsonBody) {
  node.type = "n8n-nodes-base.httpRequest";
  node.typeVersion = 4.2;
  node.parameters = {
    method: "POST",
    url,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Content-Type", value: "application/json" },
        { name: "x-calotrack-internal-key", value: internalKey },
        { name: "x-calotrack-ai-authorization", value: aiAuth },
        { name: "x-calotrack-ai-endpoint", value: aiEndpoint },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody,
    options: {},
    authentication: "none",
  };
  node.retryOnFail = true;
  node.maxTries = 3;
  node.waitBetweenTries = 3000;
  node.onError = "continueErrorOutput";
  delete node.credentials;
}

function patchParseAiResponse(workflow) {
  const node = requireNode(workflow, "Parse AI Response");
  node.parameters.jsCode = prependOnce(
    String(node.parameters?.jsCode || ""),
    "const typedNutritionPayload =",
    `const typedNutritionPayload = $input.item.json || {};
if (
  typedNutritionPayload.ok === true &&
  typeof typedNutritionPayload.status === "string" &&
  Array.isArray(typedNutritionPayload.foods) &&
  typedNutritionPayload.totals &&
  typeof typedNutritionPayload.insert_allowed === "boolean"
) {
  const originalData = $('AI Estimate Food1').first().json || {};
  const userRecord = originalData.user_record || {};
  const userIdDb = originalData.user_id_db || userRecord.id || null;
  const foods = typedNutritionPayload.foods.map((food) => ({
    ...food,
    calories: Number(food.calories || 0),
    protein: Number(food.protein || 0),
    carbs: Number(food.carbs || 0),
    fat: Number(food.fat || 0),
  }));
  const totals = typedNutritionPayload.totals || {};
  const replyText = String(typedNutritionPayload.reply_text || "").trim();

  return [{
    json: {
      ...originalData,
      ...typedNutritionPayload,
      user_record: userRecord,
      user_id_db: userIdDb,
      user_id: userIdDb,
      telegram_user_id: originalData.telegram_user_id || originalData.platform_id || null,
      trace_id: originalData.trace_id || typedNutritionPayload.trace_id || \`ct-parse-\${Date.now()}\`,
      source_message_text: originalData.source_message_text || originalData.message_text || originalData.current_message_text || "",
      food_name: typedNutritionPayload.food_name_display || foods[0]?.name || "",
      quantity: foods[0]?.quantity || 1,
      portion_text: foods[0]?.portion_text || "",
      total_calories: Number(totals.calories || 0),
      total_protein: Number(totals.protein || 0),
      total_carbs: Number(totals.carbs || 0),
      total_fat: Number(totals.fat || 0),
      foods,
      nutrition_parse_ok: Boolean(typedNutritionPayload.insert_allowed),
      food_log_insert_allowed: Boolean(typedNutritionPayload.insert_allowed),
      action_status: typedNutritionPayload.status,
      fallback_source: typedNutritionPayload.fallback_source || null,
      retryable: typedNutritionPayload.status === "nutrition_busy",
      db_effect: typedNutritionPayload.insert_allowed ? "prepare_food_logs" : "skip_food_log",
      error_code: typedNutritionPayload.error_code || null,
      error_message: typedNutritionPayload.error_code || null,
      text: replyText || undefined,
      reply_text: replyText || undefined,
      final_response: replyText ? { text: replyText, parse_mode: "Markdown" } : undefined,
    },
  }];
}

`,
  );
}

function patchFormatLogFood(workflow) {
  const node = requireNode(workflow, "Format AI Response - LOG FOOD");
  node.parameters.jsCode = prependOnce(
    String(node.parameters?.jsCode || ""),
    "const typedFoodSkipPayload =",
    `const typedFoodSkipPayload = $input.item?.json || $input.first()?.json || {};
if (typedFoodSkipPayload.food_log_insert_allowed === false) {
  const text = String(
    typedFoodSkipPayload.reply_text ||
    typedFoodSkipPayload.final_response?.text ||
    typedFoodSkipPayload.text ||
    "Mình chưa log món này vì chưa ước tính đủ chắc tay. Bạn thử lại giúp mình nhé."
  ).trim();
  return [{
    json: {
      ...typedFoodSkipPayload,
      text,
      reply_text: text,
      final_response: { text, parse_mode: "Markdown" },
      action_status: typedFoodSkipPayload.action_status || "food_log_skipped",
      db_effect: typedFoodSkipPayload.db_effect || "skip_food_log",
    },
  }];
}

`,
  );
}

function patchFoodInsertGate(workflow) {
  const node = requireNode(workflow, "Food Log Insert Allowed?");
  node.parameters.conditions.conditions[0].leftValue =
    "={{ Boolean($json.food_log_insert_allowed) && (Number($json.total_calories || 0) > 0 || Number($json.total_protein || 0) > 0 || Number($json.total_carbs || 0) > 0 || Number($json.total_fat || 0) > 0) }}";
}

function ensureCanonicalSummaryNode(workflow, internalKey) {
  let node = findNode(workflow, "Get Canonical Period Summary");
  if (!node) {
    node = {
      id: "bd861fbb-6a4a-4d5f-9bf6-zalo-period-summary",
      name: "Get Canonical Period Summary",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [3648, 1384],
      parameters: {},
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 2000,
      onError: "continueErrorOutput",
    };
    workflow.nodes.push(node);
  }

  node.parameters = {
    method: "POST",
    url: "https://calotrack-website.vercel.app/api/zalo-summary",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "Content-Type", value: "application/json" },
        { name: "x-calotrack-internal-key", value: internalKey },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: buildSummaryJsonBody(),
    options: {},
    authentication: "none",
  };
}

function patchWeeklyRouting(workflow) {
  const weeklyGate = requireNode(workflow, "Is Weekly Stats?");
  weeklyGate.parameters.conditions.conditions[0].leftValue =
    "={{ ['weekly_stats', 'monthly_stats'].includes($('Validate Query Params').first().json.query_type) }}";

  workflow.connections["Is Weekly Stats?"].main[0] = [
    {
      node: "Get Canonical Period Summary",
      type: "main",
      index: 0,
    },
  ];
  workflow.connections["Get Canonical Period Summary"] = {
    main: [[{ node: "Format Weekly Summary", type: "main", index: 0 }]],
  };
}

function patchMainWorkflow(workflow, shared) {
  const next = JSON.parse(JSON.stringify(workflow));
  const nutritionNode = requireNode(next, "AI Estimate Nutrition2");
  configureInternalHttpNode(
    nutritionNode,
    "https://calotrack-website.vercel.app/api/zalo-nutrition-estimate",
    shared.internalKey,
    shared.aiAuth,
    shared.aiEndpoint,
    buildNutritionJsonBody(),
  );

  patchParseAiResponse(next);
  patchFormatLogFood(next);
  patchFoodInsertGate(next);
  ensureCanonicalSummaryNode(next, shared.internalKey);
  patchWeeklyRouting(next);

  return next;
}

function patchGatekeeper(workflow) {
  const node = requireNode(workflow, "Gatekeeper V18");
  let code = String(node.parameters?.jsCode || "");

  code = replaceRegex(
    code,
    /  const normalizedRaw = normalizeCompare\(rawText\);\r?\n/,
    `  const normalizedRaw = normalizeCompare(rawText);
  if (/^(co\\s+)?(nho|vua|lon)$/.test(normalizedRaw)) {
    return { kind: "image_size_clarification", recent_image_prompt: recentImage };
  }
`,
    "gatekeeper_image_size_clarification",
  );

  code = replaceRegex(
    code,
    /  const directGymDurationMatch = directGymPayload\.match\(\/\\b\(20\|30\|40\|45\|50\|60\|75\|90\)\\b\/\);\r?\n  const directGymDurationMinutes = directGymDurationMatch \? Number\.parseInt\(directGymDurationMatch\[1\], 10\) : null;\r?\n/,
    `  const directGymDurationMatch = directGymPayload.match(/\\b(20|30|40|45|50|60|75|90)\\b/);
  const directGymDurationMinutes = directGymDurationMatch ? Number.parseInt(directGymDurationMatch[1], 10) : null;
  const directGymTargetKey = (() => {
    const targetText = directGymNormalized.replace(/\\b(20|30|40|45|50|60|75|90)\\b/g, "").replace(/\\b(phut|plan)\\b/g, "").trim();
    if (!targetText) return "";
    if (/\\b(nguc|chest)\\b/.test(targetText)) return "chest";
    if (/\\b(vai\\s+xo|vai\\s+loi|vai\\s+lung|shoulders\\s+back|shoulders\\s+lats)\\b/.test(targetText)) return "shoulders_lats";
    if (/\\b(xo|xô|lung|back|lat|lats)\\b/.test(targetText)) return "lats_back";
    if (/\\b(vai|shoulder|shoulders)\\b/.test(targetText)) return "shoulders";
    if (/\\b(chan|leg|legs)\\b/.test(targetText)) return "legs";
    if (/\\b(tay|arm|arms|tay\\s+truoc|tay\\s+sau)\\b/.test(targetText)) return "arms";
    if (/\\b(full\\s*body|toan\\s*than|ca\\s*nguoi|co)\\b/.test(targetText)) return "full_body";
    return "";
  })();
`,
    "gatekeeper_gym_target_key",
  );

  code = replaceRegex(
    code,
    /\} else if \(directGymMatch && \/\^plan\(\?:\\s\+\.\*\)\?\$\/i\.test\(directGymNormalized\)\) \{\r?\n    route = "CHAT";\r?\n    intent = "CHAT";\r?\n    confidence = "HIGH";\r?\n    action = "chat";\r?\n    params = \{\r?\n      command_surface: "gym_plan",\r?\n      gym_command: "plan",\r?\n      plan_duration_minutes: directGymDurationMinutes,\r?\n    \};\r?\n  \} else if \(directLogMatch\) \{\r?\n/,
    `} else if (directGymMatch && directGymTargetKey) {
    route = "CHAT";
    intent = "CHAT";
    confidence = "HIGH";
    action = "chat";
    params = {
      command_surface: "gym_plan",
      gym_command: "plan",
      gym_target_key: directGymTargetKey,
      plan_duration_minutes: directGymDurationMinutes,
    };
  } else if (directGymMatch && /^plan(?:\\s+.*)?$/i.test(directGymNormalized)) {
    route = "CHAT";
    intent = "CHAT";
    confidence = "HIGH";
    action = "chat";
    params = {
      command_surface: "gym_plan",
      gym_command: "plan",
      plan_duration_minutes: directGymDurationMinutes,
    };
  } else if (directLogMatch) {
`,
    "gatekeeper_gym_target_branch",
  );

  node.parameters.jsCode = code;
}

function patchPrepareDirectResponse(workflow) {
  const node = requireNode(workflow, "Prepare_Direct_Response");
  let code = String(node.parameters?.jsCode || "");

  code = replaceRegex(
    code,
    /if \(!\["image_subset_estimate", "image_correction"\]\.includes\(imageFollowupKind\)\) return null;/g,
    'if (!["image_subset_estimate", "image_correction", "image_size_clarification"].includes(imageFollowupKind)) return null;',
    "prepare_direct_response_followup_lists",
  );
  code = replaceRegex(
    code,
    /  if \(\/\\b\(vai mieng\|it it\|mot it\|an chut\|few bites\|few pieces\)\\b\/\.test\(normalized\)\) \{\r?\n    return 0\.25;\r?\n  \}\r?\n/,
    `  if (/\\b(vai mieng|it it|mot it|an chut|few bites|few pieces)\\b/.test(normalized)) {
    return 0.25;
  }
  if (/\\b(co\\s+)?nho\\b/.test(normalized)) {
    return 0.8;
  }
  if (/\\b(co\\s+)?vua\\b/.test(normalized)) {
    return 1;
  }
  if (/\\b(co\\s+)?lon\\b/.test(normalized)) {
    return 1.25;
  }
`,
    "prepare_direct_response_size_scale",
  );
  code = replaceRegex(
    code,
    /  if \(imageFollowupKind === "image_correction"\) \{\r?\n    return buildImageCorrectionReply\(payload, recentBotTexts\);\r?\n  \}\r?\n/,
    `  if (imageFollowupKind === "image_correction") {
    return buildImageCorrectionReply(payload, recentBotTexts);
  }
  if (imageFollowupKind === "image_size_clarification") {
    return buildImageCorrectionReply(payload, recentBotTexts);
  }
`,
    "prepare_direct_response_size_fallback",
  );

  node.parameters.jsCode = code;
}

function patchParseImageAnalysis(workflow) {
  const node = requireNode(workflow, "Parse Image Analysis");
  node.parameters.jsCode = prependOnce(
    String(node.parameters?.jsCode || ""),
    "const typedImagePayload =",
    `const typedImagePayload = $input.first().json || {};
if (
  typedImagePayload.ok === true &&
  typeof typedImagePayload.status === "string" &&
  ["review_ready", "needs_clarification", "busy", "invalid", "inbody_ready", "inbody_missing"].includes(typedImagePayload.status)
) {
  const replyText = String(typedImagePayload.reply_text || "").trim();
  const imageAnalysis = typedImagePayload.review_bundle
    ? {
        review_id: typedImagePayload.review_bundle.review_id,
        kind: typedImagePayload.review_bundle.kind,
        title: typedImagePayload.review_bundle.title,
        meal_scope: typedImagePayload.review_bundle.meal_scope,
        primary_plate_only: Boolean(typedImagePayload.review_bundle.primary_plate_only),
        foods: Array.isArray(typedImagePayload.review_bundle.foods) ? typedImagePayload.review_bundle.foods : [],
        total_calories: typedImagePayload.review_bundle.total_calories,
        total_protein: typedImagePayload.review_bundle.total_protein,
        total_carbs: typedImagePayload.review_bundle.total_carbs,
        total_fat: typedImagePayload.review_bundle.total_fat,
      }
    : undefined;

  return [{
    json: {
      ...typedImagePayload,
      route: "IMAGE",
      intent: "IMAGE",
      action: "analyze_image",
      next_step: "direct_response",
      is_direct_response: true,
      text: replyText,
      reply_text: replyText,
      final_response: { text: replyText, parse_mode: "Markdown" },
      action_status:
        typedImagePayload.status === "review_ready" ? "image_review_ready" :
        typedImagePayload.status === "needs_clarification" ? "image_needs_clarification" :
        typedImagePayload.status === "busy" ? "image_analysis_busy" :
        typedImagePayload.status === "invalid" ? "image_parse_error" :
        typedImagePayload.status === "inbody_ready" ? "inbody_review_ready" :
        "inbody_missing",
      db_effect: "update_pending_intent",
      image_analysis: imageAnalysis,
      inbody_measurement: typedImagePayload.inbody_measurement || null,
      updated_pending_intent: typedImagePayload.updated_pending_intent || {},
      error_code: typedImagePayload.error_code || null,
    },
  }];
}

`,
  );
}

function patchImageAnalyzeNode(workflow, shared) {
  const node = requireNodeByNormalizedName(workflow, "phan tich hinh anh ai");
  configureInternalHttpNode(
    node,
    "https://calotrack-website.vercel.app/api/zalo-image-analyze",
    shared.internalKey,
    shared.aiAuth,
    shared.aiEndpoint,
    buildImageJsonBody(),
  );

  delete workflow.connections["Image Analyze"];
}

function patchChatWorkflow(workflow, shared) {
  const next = JSON.parse(JSON.stringify(workflow));
  patchImageAnalyzeNode(next, shared);
  patchParseImageAnalysis(next);
  patchGatekeeper(next);
  patchPrepareDirectResponse(next);
  return next;
}

function main() {
  const rawMain = readJson(rawMainPath);
  const rawChat = readJson(rawChatPath);
  const shared = {
    internalKey: extractInternalKey(rawMain),
    aiAuth: extractAiAuth(rawMain),
    aiEndpoint: extractAiEndpoint(rawMain),
  };

  const preparedMain = patchMainWorkflow(rawMain, shared);
  const preparedChat = patchChatWorkflow(rawChat, shared);

  writeJson(preparedMainPath, preparedMain);
  writeJson(preparedChatPath, preparedChat);
  writeJson(rootMainPath, preparedMain);
  writeJson(rootChatPath, preparedChat);

  console.log(
    JSON.stringify(
      {
        ok: true,
        preparedMainPath,
        preparedChatPath,
        rootMainPath,
        rootChatPath,
        mainVersion: preparedMain.versionId || null,
        chatVersion: preparedChat.versionId || null,
      },
      null,
      2,
    ),
  );
}

main();
