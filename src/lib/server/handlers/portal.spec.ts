import { describe, expect, it } from "vitest";

import { parseCoreProfileInputText } from "./portal.js";

describe("parseCoreProfileInputText", () => {
  it("parses a mixed onboarding sentence with all core fields", () => {
    const result = parseCoreProfileInputText("Nam 24 1m85, 72kg, mức 1", null);

    expect(result.patch).toMatchObject({
      gender: "male",
      age: 24,
      height_cm: 185,
      weight_kg: 72,
      activity_level: 1,
    });
    expect(result.matchedFields.sort()).toEqual([
      "activity_level",
      "age",
      "gender",
      "height_cm",
      "weight_kg",
    ]);
  });

  it("parses compact comma-separated onboarding input", () => {
    const result = parseCoreProfileInputText("Nam,24,185,72,1", null);

    expect(result.patch).toMatchObject({
      gender: "male",
      age: 24,
      height_cm: 185,
      weight_kg: 72,
      activity_level: 1,
    });
  });

  it("treats a bare number as age only when age is the remaining missing field", () => {
    const missingAgeOnly = parseCoreProfileInputText("25", {
      gender: "male",
      age: null,
      height_cm: 185,
      weight_kg: 72,
      activity_level: 1,
    });
    const ageAlreadyPresent = parseCoreProfileInputText("25", {
      gender: "male",
      age: 24,
      height_cm: 185,
      weight_kg: 72,
      activity_level: 1,
    });

    expect(missingAgeOnly.patch).toMatchObject({ age: 25 });
    expect(missingAgeOnly.matchedFields).toContain("age");
    expect(ageAlreadyPresent.patch).toEqual({});
    expect(ageAlreadyPresent.matchedFields).toEqual([]);
  });
});
