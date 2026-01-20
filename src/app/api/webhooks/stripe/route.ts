import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { PLANS } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan as keyof typeof PLANS;

        if (!userId || !plan) {
          console.error("Missing userId or plan in metadata");
          break;
        }

        // Calculate expiry date based on plan
        let expiryDate: Date | null = null;
        const planConfig = PLANS[plan.toUpperCase() as keyof typeof PLANS];
        
        if (planConfig && planConfig.duration > 0) {
          expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + planConfig.duration);
        }

        // Update user plan in profiles table
        await supabase
          .from("profiles")
          .update({
            plan: plan.toLowerCase(),
            status: "active",
            expiry_date: expiryDate?.toISOString() || null,
            stripe_customer_id: session.customer as string,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        // Record transaction
        await supabase.from("transactions").insert({
          user_id: userId,
          amount: session.amount_total || 0,
          method: "stripe",
          status: "completed",
          stripe_payment_id: session.payment_intent as string,
        });

        console.log(`✅ User ${userId} upgraded to ${plan}`);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.error("Payment failed:", paymentIntent.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}