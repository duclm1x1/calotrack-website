"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { PLANS } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Pricing Table with 3 tiers
 * Uses Decoy Effect (middle tier highlighted)
 */
export function PricingTable() {
  const plans = Object.values(PLANS);

  return (
    <section id="pricing" className="py-24 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Chọn gói phù hợp với bạn
          </h2>
          <p className="text-lg text-muted max-w-2xl mx-auto">
            Bắt đầu miễn phí, nâng cấp khi cần. Hủy bất cứ lúc nào.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              glass={plan.highlighted}
              className={cn(
                "relative transition-all duration-300 hover:scale-105",
                plan.highlighted && "border-primary ring-2 ring-primary/20"
              )}
            >
              {/* Badge */}
              {plan.badge && (
                <div className={cn(
                  "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold",
                  plan.highlighted 
                    ? "bg-primary text-zinc-950" 
                    : "bg-zinc-800 text-foreground"
                )}>
                  {plan.badge}
                </div>
              )}

              <CardHeader className="pt-8">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>
                  {plan.duration === -1 
                    ? "Trả 1 lần - Dùng mãi mãi" 
                    : `${plan.duration} ngày sử dụng`
                  }
                </CardDescription>
              </CardHeader>

              <CardContent>
                {/* Price */}
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">
                    {formatCurrency(plan.price)}
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="text-sm text-muted">
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  {plan.id === 'trial' ? 'Dùng thử ngay' : 'Mua ngay'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

export default PricingTable;
