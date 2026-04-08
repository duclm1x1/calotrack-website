import { sendJson } from "../src/lib/server/adminServer.js";
import {
  readJsonBody,
  resolveDashboardAccess,
  saveBodyCompositionLog,
  type BodyCompositionInput,
} from "../src/lib/server/dashboardSummaryServer.js";

function mapInput(body: Record<string, unknown>): BodyCompositionInput {
  const measurement =
    body.measurement && typeof body.measurement === "object" ? (body.measurement as Record<string, unknown>) : body;

  return {
    reviewId: typeof body.reviewId === "string" ? body.reviewId : typeof body.review_id === "string" ? body.review_id : null,
    source: typeof body.source === "string" ? body.source : null,
    sourceMessageId:
      typeof body.sourceMessageId === "string"
        ? body.sourceMessageId
        : typeof body.source_message_id === "string"
          ? body.source_message_id
          : null,
    measuredAt:
      typeof measurement.measuredAt === "string"
        ? measurement.measuredAt
        : typeof measurement.measured_at === "string"
          ? measurement.measured_at
          : null,
    age: measurement.age == null ? null : Number(measurement.age),
    gender: typeof measurement.gender === "string" ? measurement.gender : null,
    heightCm: measurement.heightCm == null ? Number(measurement.height_cm ?? 0) || null : Number(measurement.heightCm),
    weightKg: measurement.weightKg == null ? Number(measurement.weight_kg ?? 0) || null : Number(measurement.weightKg),
    skeletalMuscleMassKg:
      measurement.skeletalMuscleMassKg == null
        ? Number(measurement.skeletal_muscle_mass_kg ?? 0) || null
        : Number(measurement.skeletalMuscleMassKg),
    bodyFatMassKg:
      measurement.bodyFatMassKg == null
        ? Number(measurement.body_fat_mass_kg ?? 0) || null
        : Number(measurement.bodyFatMassKg),
    bodyFatPct:
      measurement.bodyFatPct == null ? Number(measurement.body_fat_pct ?? 0) || null : Number(measurement.bodyFatPct),
    bmi: measurement.bmi == null ? null : Number(measurement.bmi),
    bmr: measurement.bmr == null ? null : Number(measurement.bmr),
    visceralFatLevel:
      measurement.visceralFatLevel == null
        ? Number(measurement.visceral_fat_level ?? 0) || null
        : Number(measurement.visceralFatLevel),
    waistHipRatio:
      measurement.waistHipRatio == null
        ? Number(measurement.waist_hip_ratio ?? 0) || null
        : Number(measurement.waistHipRatio),
    inbodyScore:
      measurement.inbodyScore == null ? Number(measurement.inbody_score ?? 0) || null : Number(measurement.inbodyScore),
    targetWeightKg:
      measurement.targetWeightKg == null
        ? Number(measurement.target_weight_kg ?? 0) || null
        : Number(measurement.targetWeightKg),
    weightControlKg:
      measurement.weightControlKg == null
        ? Number(measurement.weight_control_kg ?? 0) || null
        : Number(measurement.weightControlKg),
    fatControlKg:
      measurement.fatControlKg == null
        ? Number(measurement.fat_control_kg ?? 0) || null
        : Number(measurement.fatControlKg),
    muscleControlKg:
      measurement.muscleControlKg == null
        ? Number(measurement.muscle_control_kg ?? 0) || null
        : Number(measurement.muscleControlKg),
    rawOcr: measurement.rawOcr ?? measurement.raw_ocr ?? {},
    rawExtracted: measurement.rawExtracted ?? measurement.raw_extracted ?? {},
    overwriteDemographics: body.overwriteDemographics === true || body.overwrite_demographics === true,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!["POST", "PUT", "PATCH"].includes(String(req.method || "").toUpperCase())) {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const access = await resolveDashboardAccess(req, body);
    const result = await saveBodyCompositionLog(access.admin, access.context, mapInput(body));
    sendJson(res, 200, {
      ok: true,
      data: {
        accessKind: access.accessKind,
        ...result,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message || error || "portal_body_composition_failed");
    sendJson(
      res,
      message === "auth_required" || message === "customer_not_linked" ? 401 : 500,
      {
        ok: false,
        error: message,
        message,
      },
    );
  }
}
