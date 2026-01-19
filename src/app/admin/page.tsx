"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

/**
 * Admin Overview Page
 */
export default function AdminOverviewPage() {
  // Mock data - will come from Supabase
  const stats = {
    totalRevenue: 15800000,
    activeUsers: 127,
    conversionRate: 8.5,
    pendingApprovals: 3
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tổng quan</h1>
        <p className="text-muted">Xem nhanh các chỉ số quan trọng</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Tổng doanh thu</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(stats.totalRevenue)}
                </p>
                <p className="text-xs text-success mt-1">+12% so với tháng trước</p>
              </div>
              <span className="text-3xl">💰</span>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">User đang hoạt động</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stats.activeUsers}</p>
                <p className="text-xs text-success mt-1">+5 hôm nay</p>
              </div>
              <span className="text-3xl">👥</span>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Tỷ lệ chuyển đổi</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stats.conversionRate}%</p>
                <p className="text-xs text-muted mt-1">Trial → Pro</p>
              </div>
              <span className="text-3xl">📈</span>
            </div>
          </CardContent>
        </Card>

        <Card glass className="border-warning/50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted">Chờ duyệt</p>
                <p className="text-2xl font-bold text-warning mt-1">{stats.pendingApprovals}</p>
                <p className="text-xs text-warning mt-1">Cần xử lý ngay!</p>
              </div>
              <span className="text-3xl">⏳</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Doanh thu theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-zinc-900/50 rounded-lg">
              <p className="text-muted text-sm">📊 Chart sẽ hiển thị ở đây</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User mới theo ngày</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-zinc-900/50 rounded-lg">
              <p className="text-muted text-sm">📊 Chart sẽ hiển thị ở đây</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
