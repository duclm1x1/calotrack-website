"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Referral {
  id: string;
  referredEmail: string;
  status: "pending" | "completed";
  rewardAmount: number;
  createdAt: string;
}

/**
 * Referrals Page - Affiliate/referral program
 */
export default function ReferralsPage() {
  const [copied, setCopied] = useState(false);
  
  // Mock data - will come from Supabase
  const referralCode = "USER123ABC";
  const referralLink = `https://calotrack.app/register?ref=${referralCode}`;
  const totalEarned = 597000;
  const pendingReward = 199000;
  
  const referrals: Referral[] = [
    {
      id: "1",
      referredEmail: "n***@gmail.com",
      status: "completed",
      rewardAmount: 199000,
      createdAt: "2026-01-15"
    },
    {
      id: "2",
      referredEmail: "t***@gmail.com",
      status: "completed",
      rewardAmount: 199000,
      createdAt: "2026-01-17"
    },
    {
      id: "3",
      referredEmail: "h***@gmail.com",
      status: "completed",
      rewardAmount: 199000,
      createdAt: "2026-01-18"
    },
    {
      id: "4",
      referredEmail: "m***@gmail.com",
      status: "pending",
      rewardAmount: 199000,
      createdAt: "2026-01-19"
    }
  ];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Giới thiệu bạn bè 👥</h1>
        <p className="text-muted">Mời bạn bè và nhận thưởng 30% hoa hồng!</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card glass className="text-center p-6">
          <span className="text-4xl mb-2 block">💰</span>
          <p className="text-3xl font-bold text-primary">
            {new Intl.NumberFormat('vi-VN').format(totalEarned)}đ
          </p>
          <p className="text-sm text-muted">Tổng đã kiếm được</p>
        </Card>
        
        <Card glass className="text-center p-6">
          <span className="text-4xl mb-2 block">⏳</span>
          <p className="text-3xl font-bold text-warning">
            {new Intl.NumberFormat('vi-VN').format(pendingReward)}đ
          </p>
          <p className="text-sm text-muted">Đang chờ duyệt</p>
        </Card>
        
        <Card glass className="text-center p-6">
          <span className="text-4xl mb-2 block">👥</span>
          <p className="text-3xl font-bold text-foreground">{referrals.length}</p>
          <p className="text-sm text-muted">Bạn bè đã mời</p>
        </Card>
      </div>

      {/* Referral Link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Link giới thiệu của bạn</CardTitle>
          <CardDescription>
            Chia sẻ link này cho bạn bè. Khi họ đăng ký và mua gói, bạn nhận 30% hoa hồng!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input 
              value={referralLink}
              readOnly
              className="bg-zinc-900"
            />
            <Button onClick={handleCopy} className="shrink-0">
              {copied ? "✓ Đã copy!" : "📋 Copy"}
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <span>📱</span> Chia sẻ Telegram
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <span>💬</span> Chia sẻ Zalo
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <span>📘</span> Chia sẻ Facebook
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-lg">Cách hoạt động</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                1️⃣
              </div>
              <h3 className="font-medium text-foreground mb-1">Chia sẻ link</h3>
              <p className="text-sm text-muted">Gửi link giới thiệu cho bạn bè</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                2️⃣
              </div>
              <h3 className="font-medium text-foreground mb-1">Bạn bè đăng ký</h3>
              <p className="text-sm text-muted">Họ tạo tài khoản và mua gói Pro/Lifetime</p>
            </div>
            <div className="text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                3️⃣
              </div>
              <h3 className="font-medium text-foreground mb-1">Nhận thưởng</h3>
              <p className="text-sm text-muted">Bạn nhận 30% giá trị đơn hàng!</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lịch sử giới thiệu</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {referrals.length > 0 ? (
              referrals.map((ref) => (
                <div 
                  key={ref.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-zinc-900/50 border border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      👤
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{ref.referredEmail}</p>
                      <p className="text-xs text-muted">{ref.createdAt}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${ref.status === "completed" ? "text-success" : "text-warning"}`}>
                      +{new Intl.NumberFormat('vi-VN').format(ref.rewardAmount)}đ
                    </p>
                    <p className="text-xs text-muted">
                      {ref.status === "completed" ? "✓ Đã nhận" : "⏳ Chờ duyệt"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted">
                <p>Chưa có referral nào.</p>
                <p className="text-sm">Bắt đầu chia sẻ link để kiếm hoa hồng! 💪</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
