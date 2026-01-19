import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/badges/check
 * Check if user has unlocked any new badges
 * Returns newly unlocked badges for notification
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user stats
    const { data: userData } = await supabase
      .from("user_management")
      .select("streak, credits")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get already unlocked badges
    const { data: unlockedBadges } = await supabase
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", user.id);

    const unlockedIds = new Set(unlockedBadges?.map(b => b.badge_id) || []);

    // Get all badges
    const { data: allBadges } = await supabase
      .from("badges")
      .select("*");

    if (!allBadges) {
      return NextResponse.json({ newBadges: [] });
    }

    // Check unlock conditions
    const newlyUnlocked: typeof allBadges = [];

    for (const badge of allBadges) {
      if (unlockedIds.has(badge.id)) continue;

      let shouldUnlock = false;

      switch (badge.code) {
        case "first_log":
          // Already unlocked via trigger typically
          break;
        case "streak_7":
          shouldUnlock = userData.streak >= 7;
          break;
        case "streak_30":
          shouldUnlock = userData.streak >= 30;
          break;
        case "calorie_master":
          // TODO: Check if hit goal 7 days in a row
          break;
        case "social_butterfly":
          // Check referrals
          const { count } = await supabase
            .from("referrals")
            .select("*", { count: "exact", head: true })
            .eq("referrer_id", user.id)
            .eq("status", "completed");
          shouldUnlock = (count || 0) >= 3;
          break;
      }

      if (shouldUnlock) {
        // Unlock badge
        await supabase.from("user_badges").insert({
          user_id: user.id,
          badge_id: badge.id,
        });
        newlyUnlocked.push(badge);
      }
    }

    return NextResponse.json({
      newBadges: newlyUnlocked,
      totalUnlocked: unlockedIds.size + newlyUnlocked.length,
      streak: userData.streak,
    });
  } catch (error) {
    console.error("Badge check error:", error);
    return NextResponse.json({ error: "Failed to check badges" }, { status: 500 });
  }
}
