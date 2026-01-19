"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Settings Page - User profile and app settings
 */
export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false);
  
  // Mock data
  const [profile, setProfile] = useState({
    name: "Nguyễn Văn A",
    email: "nguyenvana@gmail.com",
    telegramId: "@nguyenvana",
    dailyGoal: 2000,
    notifications: true
  });

  const handleSave = async () => {
    setIsSaving(true);
    // TODO: Save to Supabase
    await new Promise(r => setTimeout(r, 500));
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cài đặt ⚙️</h1>
        <p className="text-muted">Quản lý thông tin cá nhân và tùy chọn</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Thông tin cá nhân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
              👤
            </div>
            <div>
              <p className="font-medium text-foreground">{profile.name}</p>
              <p className="text-sm text-muted">{profile.email}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted mb-1 block">Họ tên</label>
              <Input 
                value={profile.name}
                onChange={(e) => setProfile({...profile, name: e.target.value})}
              />
            </div>
            <div>
              <label className="text-sm text-muted mb-1 block">Email</label>
              <Input 
                value={profile.email}
                disabled
                className="opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-muted mb-1 block">Telegram ID</label>
            <Input 
              value={profile.telegramId}
              onChange={(e) => setProfile({...profile, telegramId: e.target.value})}
              placeholder="@username"
            />
            <p className="text-xs text-muted mt-1">ID Telegram để nhận tin nhắn từ bot</p>
          </div>
        </CardContent>
      </Card>

      {/* Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mục tiêu dinh dưỡng</CardTitle>
          <CardDescription>Thiết lập mục tiêu calo hàng ngày</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted mb-1 block">Mục tiêu calo/ngày</label>
            <div className="flex items-center gap-4">
              <Input 
                type="number"
                value={profile.dailyGoal}
                onChange={(e) => setProfile({...profile, dailyGoal: Number(e.target.value)})}
                className="w-32"
              />
              <span className="text-muted">kcal</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            {[1500, 2000, 2500].map((goal) => (
              <Button 
                key={goal}
                variant={profile.dailyGoal === goal ? "default" : "outline"}
                size="sm"
                onClick={() => setProfile({...profile, dailyGoal: goal})}
              >
                {goal} kcal
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Thông báo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-900/50">
              <div>
                <p className="font-medium text-foreground">Nhắc log mỗi ngày</p>
                <p className="text-sm text-muted">Nhận tin nhắn nhắc nhở lúc 12:00</p>
              </div>
              <button
                onClick={() => setProfile({...profile, notifications: !profile.notifications})}
                className={`
                  w-12 h-6 rounded-full transition-colors relative
                  ${profile.notifications ? "bg-primary" : "bg-zinc-700"}
                `}
              >
                <span 
                  className={`
                    absolute top-1 h-4 w-4 rounded-full bg-white transition-all
                    ${profile.notifications ? "left-7" : "left-1"}
                  `}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-error/30">
        <CardHeader>
          <CardTitle className="text-lg text-error">Vùng nguy hiểm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Xóa tài khoản</p>
              <p className="text-sm text-muted">Xóa vĩnh viễn tài khoản và dữ liệu</p>
            </div>
            <Button variant="destructive" size="sm">Xóa tài khoản</Button>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} isLoading={isSaving}>
          💾 Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
