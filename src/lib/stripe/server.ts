import Stripe from "stripe";
import { PLANS } from "@/lib/constants";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutParams {
  plan: "trial" | "pro" | "lifetime";
  customerEmail: string;
  userId: string;
}

/**
 * Get Stripe price ID for a plan
 */
function getPriceForPlan(plan: keyof typeof PLANS): number {
  const planConfig = PLANS[plan.toUpperCase() as keyof typeof PLANS];
  return planConfig?.price || 0;
}

/**
 * Create a Stripe Checkout Session
 */
export async function createCheckoutSession({
  plan,
  customerEmail,
  userId,
}: CheckoutParams): Promise<Stripe.Checkout.Session> {
  const price = getPriceForPlan(plan.toUpperCase() as keyof typeof PLANS);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: customerEmail,
    line_items: [
      {
        price_data: {
          currency: "vnd",
          product_data: {
            name: `CaloTrack ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
            description: `Gói ${plan} cho CaloTrack`,
          },
          unit_amount: price,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?checkout=cancelled`,
    metadata: {
      userId,
      plan,
    },
  });

  return session;
}