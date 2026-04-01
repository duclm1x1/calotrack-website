import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

type DailySummary = {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  calorie_goal: number | null;
};

export function MacroTracker({ linkedUserId }: { linkedUserId: number | null }) {
  const [data, setData] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!linkedUserId) {
        setLoading(false);
        return;
      }
      
      const today = new Date();
      const pastWeek = new Date();
      pastWeek.setDate(today.getDate() - 6);

      const { data: summaries, error } = await supabase
        .from("daily_summaries")
        .select("date, total_calories, total_protein, total_carbs, total_fat, calorie_goal")
        .eq("user_id", linkedUserId)
        .gte("date", pastWeek.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (!error && summaries) {
        // Map data, fill missing days if necessary? We can just use the returned rows.
        setData(summaries as DailySummary[]);
      }
      setLoading(false);
    }
    
    loadStats();
  }, [linkedUserId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[32px] border border-primary/10 bg-white/85 p-6 shadow-md backdrop-blur">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!linkedUserId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-[32px] border border-primary/10 bg-white/85 p-6 text-center shadow-md backdrop-blur">
        <Target className="mb-4 h-8 w-8 text-muted-foreground/50" />
        <h3 className="mb-2 font-semibold text-foreground">Chưa liên kết tài khoản</h3>
        <p className="text-sm text-muted-foreground">Bạn cần liên kết số điện thoại hoặc dùng Chat bot để xem biểu đồ dinh dưỡng.</p>
      </div>
    );
  }

  const todayData = data.find(d => d.date === new Date().toISOString().split("T")[0]);

  return (
    <div className="space-y-6 rounded-[32px] border border-primary/10 bg-white/85 p-6 shadow-md backdrop-blur">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold text-foreground">Thống Kê 7 Ngày Qua</h3>
        <p className="text-sm text-muted-foreground">Calories nạp vào và mục tiêu hàng ngày</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-primary/10 bg-primary/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Calories Hôm Nay</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{todayData?.total_calories || 0} <span className="text-sm font-normal text-muted-foreground">/ {todayData?.calorie_goal || 2000}</span></div>
        </div>
        <div className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Protein</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{Math.round(todayData?.total_protein || 0)}g</div>
        </div>
        <div className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Carbs</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{Math.round(todayData?.total_carbs || 0)}g</div>
        </div>
        <div className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Fat</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{Math.round(todayData?.total_fat || 0)}g</div>
        </div>
      </div>

      <div className="h-72 w-full pt-4">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tickMargin={10} 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} 
                tickFormatter={(val) => new Date(val).toLocaleDateString("vi-VN", { weekday: 'short' })}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} 
              />
              <Tooltip 
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-sm)" }}
              />
              <Bar dataKey="total_calories" fill="hsl(var(--teal))" radius={[4, 4, 0, 0]} name="Calories" />
              {/* Optional reference line for average goal if exists */}
              <ReferenceLine y={2000} stroke="hsl(var(--flame))" strokeDasharray="3 3" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            Chưa có dữ liệu ăn uống trong 7 ngày qua.
          </div>
        )}
      </div>
    </div>
  );
}
