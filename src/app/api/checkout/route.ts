import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/checkout
 * Create a Stripe Checkout session for purchasing a plan
 */
export async function POST(request: NextRequest) {
  try {
    const { plan } = await request.json();

    // Validate plan
    if (!["trial", "pro", "lifetime"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan" },
        { status: 400 }
      );
    }

    // Get current user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Create Stripe checkout session
    const session = await createCheckoutSession({
      plan,
      customerEmail: user.email!,
      userId: user.id,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
