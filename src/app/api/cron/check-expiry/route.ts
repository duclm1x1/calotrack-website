import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/check-expiry
 * Check and expire users whose plans have ended
 * 
 * Call this via Vercel Cron or external cron service
 * Recommended: Run every hour
 * 
 * Security: Verify cron secret in production
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find users with expired plans from profiles table
    const now = new Date().toISOString();
    const { data: expiredUsers, error: selectError } = await supabase
      .from("profiles")
      .select("id, email, plan, expiry_date")
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .lt("expiry_date", now);

    if (selectError) {
      console.error("Error finding expired users:", selectError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      return NextResponse.json({ 
        message: "No expired users found",
        processed: 0 
      });
    }

    // Update expired users in profiles table
    const userIds = expiredUsers.map(u => u.id);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        status: "expired",
        credits: 0,
        updated_at: now
      })
      .in("id", userIds);

    if (updateError) {
      console.error("Error updating expired users:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    // TODO: Send notification emails via n8n
    // for (const user of expiredUsers) {
    //   await fetch(process.env.N8N_WEBHOOK_URL!, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       event: "plan_expired",
    //       userId: user.id,
    //       email: user.email,
    //       plan: user.plan
    //     })
    //   });
    // }

    return NextResponse.json({
      message: "Expiry check completed",
      processed: expiredUsers.length,
      expiredUsers: expiredUsers.map(u => u.email)
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
