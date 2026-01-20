"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { User } from "@/types";

/**
 * Dashboard Main Page - Overview of user's account
 */
export default function DashboardPage() {
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        
        setProfile(data as User | null);
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Calculate days remaining
  const daysRemaining = profile?.expiry_date
    ? Math.max(0, Math.ceil((new Date(profile.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Xin chào, {profile?.name || "Người dùng"} 👋
        </h1>
        <p className="text-muted">Đây là tổng quan tài khoản của bạn</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Plan Status */}
        <Card glass className="border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Gói hiện tại</p>
                <p className="text-2xl font-bold text-primary mt-1 capitalize">
                  {profile?.plan || "Free"}
                </p>
                <p className="text-xs text-muted mt-1">
                  {profile?.plan === "lifetime" ? "Vĩnh viễn" : `Còn ${daysRemaining} ngày`}
                </p>
              </div>
              <span className="text-3xl">💎</span>
            </div>
          </CardContent>
        </Card>

        {/* Streak */}
        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Streak hiện tại</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {profile?.streak || 0} ngày
                </p>
                <p className="text-xs text-success mt-1">🔥 Keep going!</p>
              </div>
              <span className="text-3xl">🔥</span>
            </div>
          </CardContent>
        </Card>

        {/* Credits */}
        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Credits còn lại</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {profile?.credits || 0}
                </p>
                <p className="text-xs text-muted mt-1">Phân tích AI</p>
              </div>
              <span className="text-3xl">✨</span>
            </div>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Trạng thái</p>
                <p className={`text-2xl font-bold mt-1 capitalize ${
                  profile?.status === "active" ? "text-success" : "text-warning"
                }`}>
                  {profile?.status === "active" ? "Hoạt động" : profile?.status || "Pending"}
                </p>
                <p className="text-xs text-muted mt-1">Tài khoản</p>
              </div>
              <span className="text-3xl">✅</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hành động nhanh</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button>📸 Phân tích bữa ăn</Button>
          <Button variant="outline">📊 Xem thống kê</Button>
          <Button variant="outline">🏆 Xem huy hiệu</Button>
          <Button variant="ghost">⚙️ Cài đặt</Button>
        </CardContent>
      </Card>

      {/* Upgrade CTA */}
      {profile?.plan !== "lifetime" && (
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/30">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  🚀 Nâng cấp lên Lifetime!
                </h3>
                <p className="text-muted">
                  Trả một lần, sử dụng mãi mãi. Chỉ {formatCurrency(1000000)}
                </p>
              </div>
              <Button size="lg" className="shrink-0">
                Nâng cấp ngay
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}