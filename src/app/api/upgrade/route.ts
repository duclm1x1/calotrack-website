import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe/server";

/**
 * POST /api/upgrade
 * Upgrade user's plan (Trial → Pro, Pro → Lifetime, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const { targetPlan } = await request.json();

    // Validate target plan
    const validPlans = ["trial", "pro", "lifetime"];
    if (!validPlans.includes(targetPlan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get current user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current plan from profiles table
    const { data: userData } = await supabase
      .from("profiles")
      .select("plan, status")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentPlan = userData.plan;
    
    // Define plan hierarchy
    const planHierarchy: Record<string, number> = {
      free: 0,
      trial: 1,
      pro: 2,
      lifetime: 3,
    };

    // Check if upgrade is valid
    if (planHierarchy[targetPlan] <= planHierarchy[currentPlan]) {
      return NextResponse.json({ 
        error: "Can only upgrade to a higher plan",
        currentPlan,
        targetPlan
      }, { status: 400 });
    }

    // Lifetime users can't upgrade
    if (currentPlan === "lifetime") {
      return NextResponse.json({ 
        error: "Already on Lifetime plan",
        currentPlan 
      }, { status: 400 });
    }

    // Create checkout session for upgrade
    const session = await createCheckoutSession({
      plan: targetPlan as "trial" | "pro" | "lifetime",
      customerEmail: user.email!,
      userId: user.id,
    });

    return NextResponse.json({ 
      url: session.url,
      currentPlan,
      targetPlan 
    });
  } catch (error) {
    console.error("Upgrade error:", error);
    return NextResponse.json({ error: "Failed to create upgrade session" }, { status: 500 });
  }
}
