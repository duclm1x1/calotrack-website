import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals
 * Get user's referrals and stats
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get referral code from profiles table
    await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    // Get user's referrals
    const { data: referrals } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    // Calculate stats
    const completedReferrals = referrals?.filter(r => r.status === "completed") || [];
    const totalEarned = completedReferrals.reduce((sum, r) => sum + (r.reward_amount || 0), 0);
    const pendingReward = (referrals?.filter(r => r.status === "pending") || [])
      .reduce((sum, r) => sum + (r.reward_amount || 0), 0);

    // Generate referral code if not exists
    const referralCode = `${user.id.substring(0, 8).toUpperCase()}`;

    return NextResponse.json({
      referralCode,
      referralLink: `${process.env.NEXT_PUBLIC_APP_URL}/register?ref=${referralCode}`,
      stats: {
        totalReferrals: referrals?.length || 0,
        completedReferrals: completedReferrals.length,
        totalEarned,
        pendingReward,
      },
      referrals: referrals || [],
    });
  } catch (error) {
    console.error("Referrals error:", error);
    return NextResponse.json({ error: "Failed to get referrals" }, { status: 500 });
  }
}

/**
 * POST /api/referrals/track
 * Track a referral when new user registers with ref code
 */
export async function POST(request: NextRequest) {
  try {
    const { referralCode, newUserId } = await request.json();

    if (!referralCode || !newUserId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();

    // Find referrer by code (code = first 8 chars of user ID) from profiles table
    const { data: users } = await supabase
      .from("profiles")
      .select("id")
      .ilike("id", `${referralCode.toLowerCase()}%`);

    if (!users || users.length === 0) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 });
    }

    const referrerId = users[0].id;

    // Check if referral already exists
    const { data: existing } = await supabase
      .from("referrals")
      .select("id")
      .eq("referrer_id", referrerId)
      .eq("referred_user_id", newUserId)
      .single();

    if (existing) {
      return NextResponse.json({ message: "Referral already tracked" });
    }

    // Create referral record
    const { error: insertError } = await supabase.from("referrals").insert({
      referrer_id: referrerId,
      referred_user_id: newUserId,
      referral_code: referralCode,
      status: "pending",
      reward_amount: 0, // Will be set when referred user pays
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
    }

    return NextResponse.json({ message: "Referral tracked successfully" });
  } catch (error) {
    console.error("Track referral error:", error);
    return NextResponse.json({ error: "Failed to track referral" }, { status: 500 });
  }
}
