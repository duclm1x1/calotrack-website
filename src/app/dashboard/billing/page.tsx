"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Transaction {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

/**
 * Billing Page - Manage subscription and view transaction history
 */
export default function BillingPage() {
  // Mock data
  const currentPlan = {
    name: "Pro",
    price: 199000,
    expiryDate: "28/02/2026",
    daysRemaining: 41,
    status: "active"
  };

  const transactions: Transaction[] = [
    {
      id: "1",
      amount: 199000,
      method: "Stripe",
      status: "completed",
      createdAt: "18/01/2026"
    },
    {
      id: "2",
      amount: 10000,
      method: "Bank Transfer",
      status: "completed",
      createdAt: "10/01/2026"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Thanh toán 💳</h1>
        <p className="text-muted">Quản lý gói dịch vụ và lịch sử giao dịch</p>
      </div>

      {/* Current Plan */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Gói hiện tại</span>
            <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded-full">
              {currentPlan.status === "active" ? "Đang hoạt động" : "Hết hạn"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <p className="text-3xl font-bold text-primary">{currentPlan.name}</p>
              <p className="text-muted">{formatCurrency(currentPlan.price)}/tháng</p>
            </div>
            <div className="text-right">
              <p className="text-foreground">Hết hạn: <span className="font-semibold">{currentPlan.expiryDate}</span></p>
              <p className="text-sm text-muted">Còn {currentPlan.daysRemaining} ngày</p>
            </div>
          </div>
          
          <div className="mt-6 flex flex-wrap gap-3">
            <Button>⬆️ Nâng cấp Lifetime</Button>
            <Button variant="outline">🔄 Gia hạn</Button>
            <Button variant="ghost" className="text-muted">Hủy gói</Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <span className="text-3xl">💳</span>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">Phương thức thanh toán</h3>
                <p className="text-sm text-muted">Visa ***4242</p>
              </div>
              <Button variant="outline" size="sm">Cập nhật</Button>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <span className="text-3xl">🧾</span>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">Hóa đơn</h3>
                <p className="text-sm text-muted">Xuất invoice cho kế toán</p>
              </div>
              <Button variant="outline" size="sm">Tải về</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lịch sử giao dịch</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-3 px-2 text-sm text-muted font-medium">Ngày</th>
                  <th className="text-left py-3 px-2 text-sm text-muted font-medium">Số tiền</th>
                  <th className="text-left py-3 px-2 text-sm text-muted font-medium">Phương thức</th>
                  <th className="text-left py-3 px-2 text-sm text-muted font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-800/50">
                    <td className="py-3 px-2 text-foreground">{t.createdAt}</td>
                    <td className="py-3 px-2 text-foreground font-medium">{formatCurrency(t.amount)}</td>
                    <td className="py-3 px-2 text-muted">{t.method}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        t.status === "completed" 
                          ? "bg-success/20 text-success" 
                          : "bg-warning/20 text-warning"
                      }`}>
                        {t.status === "completed" ? "Hoàn thành" : "Đang xử lý"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
