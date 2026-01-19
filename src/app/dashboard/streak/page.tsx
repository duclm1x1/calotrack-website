"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Calendar Day Component
 */
function CalendarDay({ 
  day, 
  hasStreak, 
  isToday 
}: { 
  day: number | null; 
  hasStreak: boolean; 
  isToday: boolean;
}) {
  if (!day) {
    return <div className="h-10 w-10" />;
  }
  
  return (
    <div
      className={`
        h-10 w-10 flex items-center justify-center rounded-full text-sm font-medium
        transition-all duration-200
        ${hasStreak 
          ? "bg-primary text-zinc-950 shadow-lg shadow-primary/30" 
          : "text-muted hover:bg-zinc-800"
        }
        ${isToday && !hasStreak ? "ring-2 ring-primary" : ""}
      `}
    >
      {hasStreak ? "🔥" : day}
    </div>
  );
}

/**
 * Streak Calendar Component
 */
function StreakCalendar({ streakDays }: { streakDays: number[] }) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  
  // Create calendar grid
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }
  
  const weekDays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const monthNames = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
    "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {monthNames[currentMonth]} {currentYear}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d) => (
            <div key={d} className="h-10 flex items-center justify-center text-xs text-muted font-medium">
              {d}
            </div>
          ))}
          {days.map((day, idx) => (
            <CalendarDay
              key={idx}
              day={day}
              hasStreak={day !== null && streakDays.includes(day)}
              isToday={day === today.getDate()}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Streak Page - Track user's daily logging streak
 */
export default function StreakPage() {
  // Mock data - will come from Supabase
  const currentStreak = 7;
  const longestStreak = 23;
  const totalDaysLogged = 45;
  const streakDays = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // Days in current month with streak
  
  const milestones = [
    { days: 7, reward: "🎖️ Week Warrior", achieved: true },
    { days: 14, reward: "🏅 Two Week Champion", achieved: false },
    { days: 30, reward: "🏆 Monthly Master", achieved: false },
    { days: 100, reward: "💎 Century Legend", achieved: false },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Streak 🔥</h1>
        <p className="text-muted">Duy trì thói quen log mỗi ngày</p>
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card glass className="text-center p-6">
          <span className="text-5xl mb-2 block">🔥</span>
          <p className="text-4xl font-bold text-primary">{currentStreak}</p>
          <p className="text-sm text-muted">Ngày liên tiếp</p>
        </Card>
        
        <Card glass className="text-center p-6">
          <span className="text-5xl mb-2 block">🏆</span>
          <p className="text-4xl font-bold text-secondary">{longestStreak}</p>
          <p className="text-sm text-muted">Kỷ lục streak</p>
        </Card>
        
        <Card glass className="text-center p-6">
          <span className="text-5xl mb-2 block">📅</span>
          <p className="text-4xl font-bold text-foreground">{totalDaysLogged}</p>
          <p className="text-sm text-muted">Tổng ngày đã log</p>
        </Card>
      </div>

      {/* Calendar & Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StreakCalendar streakDays={streakDays} />
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Milestones</CardTitle>
            <CardDescription>Mốc thành tích streak</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {milestones.map((m) => (
              <div
                key={m.days}
                className={`
                  flex items-center justify-between p-4 rounded-lg border
                  ${m.achieved 
                    ? "border-primary/50 bg-primary/10" 
                    : "border-zinc-800 bg-zinc-900/50"
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{m.reward.split(" ")[0]}</span>
                  <div>
                    <p className={`font-medium ${m.achieved ? "text-primary" : "text-foreground"}`}>
                      {m.reward.split(" ").slice(1).join(" ")}
                    </p>
                    <p className="text-xs text-muted">{m.days} ngày liên tiếp</p>
                  </div>
                </div>
                {m.achieved ? (
                  <span className="text-primary text-xl">✓</span>
                ) : (
                  <span className="text-muted text-sm">{m.days - currentStreak} ngày nữa</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
