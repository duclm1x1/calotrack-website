"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

/**
 * Badge Card Component
 */
function BadgeCard({ badge }: { badge: Badge }) {
  const isUnlocked = badge.unlockedAt !== null;
  
  return (
    <div
      className={`
        relative p-6 rounded-2xl text-center transition-all duration-300
        ${isUnlocked 
          ? "bg-zinc-900 border border-primary/50 shadow-lg shadow-primary/10" 
          : "bg-zinc-900/50 border border-zinc-800 opacity-60"
        }
      `}
    >
      {/* Glow effect for unlocked */}
      {isUnlocked && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 -z-10" />
      )}
      
      {/* Badge Icon */}
      <div className={`text-5xl mb-4 ${isUnlocked ? "" : "grayscale"}`}>
        {badge.icon}
      </div>
      
      {/* Badge Name */}
      <h3 className={`font-semibold mb-1 ${isUnlocked ? "text-foreground" : "text-muted"}`}>
        {badge.name}
      </h3>
      
      {/* Description */}
      <p className="text-xs text-muted mb-3">{badge.description}</p>
      
      {/* Status */}
      {isUnlocked ? (
        <span className="inline-flex items-center gap-1 text-xs text-primary">
          <span>✓</span>
          <span>Đã mở khóa</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          <span>🔒</span>
          <span>Chưa mở khóa</span>
        </span>
      )}
    </div>
  );
}

/**
 * Badges Page - User achievement badges
 */
export default function BadgesPage() {
  // Mock data - will come from Supabase
  const badges: Badge[] = [
    {
      id: "1",
      code: "first_log",
      name: "First Log",
      description: "Ghi nhận bữa ăn đầu tiên",
      icon: "🥇",
      unlockedAt: "2026-01-12T10:00:00Z"
    },
    {
      id: "2",
      code: "streak_7",
      name: "Streak 7",
      description: "Duy trì 7 ngày liên tiếp",
      icon: "🔥",
      unlockedAt: "2026-01-18T10:00:00Z"
    },
    {
      id: "3",
      code: "streak_30",
      name: "Streak 30",
      description: "Duy trì 30 ngày liên tiếp",
      icon: "💪",
      unlockedAt: null
    },
    {
      id: "4",
      code: "calorie_master",
      name: "Calorie Master",
      description: "Đạt mục tiêu 7 ngày liên tiếp",
      icon: "🎯",
      unlockedAt: null
    },
    {
      id: "5",
      code: "social_butterfly",
      name: "Social Butterfly",
      description: "Mời 3 bạn bè tham gia",
      icon: "🦋",
      unlockedAt: null
    },
    {
      id: "6",
      code: "early_bird",
      name: "Early Bird",
      description: "Log trước 7h sáng 5 lần",
      icon: "🌅",
      unlockedAt: "2026-01-15T06:30:00Z"
    },
    {
      id: "7",
      code: "variety_chef",
      name: "Variety Chef",
      description: "Log 20 món ăn khác nhau",
      icon: "👨‍🍳",
      unlockedAt: null
    },
    {
      id: "8",
      code: "vietnamese_foodie",
      name: "Vietnamese Foodie",
      description: "Log 10 món Việt Nam",
      icon: "🇻🇳",
      unlockedAt: "2026-01-17T12:00:00Z"
    }
  ];

  const unlockedCount = badges.filter(b => b.unlockedAt).length;
  const totalCount = badges.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Huy hiệu 🏆</h1>
          <p className="text-muted">Bộ sưu tập thành tích của bạn</p>
        </div>
        <Card glass className="px-4 py-2">
          <p className="text-sm text-muted">Đã mở khóa</p>
          <p className="text-xl font-bold text-primary">{unlockedCount}/{totalCount}</p>
        </Card>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
          style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
        />
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {badges.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </div>

      {/* Motivation Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/30">
        <CardContent className="pt-6 text-center">
          <p className="text-lg text-foreground">
            🎮 Còn <span className="font-bold text-primary">{totalCount - unlockedCount}</span> huy hiệu chờ bạn mở khóa!
          </p>
          <p className="text-sm text-muted mt-1">
            Tiếp tục log mỗi ngày để thu thập thêm huy hiệu nhé! 💪
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
