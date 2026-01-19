"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Forgot Password Page
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setIsSubmitted(true);
      } else {
        setError(data.error || "Có lỗi xảy ra");
      }
    } catch {
      setError("Không thể kết nối server");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card glass className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <span className="text-5xl mb-4 block">📧</span>
            <h2 className="text-xl font-bold text-foreground mb-2">Kiểm tra email</h2>
            <p className="text-muted mb-6">
              Nếu tài khoản tồn tại, chúng tôi đã gửi link đặt lại mật khẩu đến <strong>{email}</strong>
            </p>
            <Link href="/login">
              <Button variant="outline">← Về đăng nhập</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card glass className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Quên mật khẩu</CardTitle>
          <CardDescription>
            Nhập email để nhận link đặt lại mật khẩu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                {error}
              </div>
            )}
            
            <Input
              type="email"
              placeholder="Email của bạn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Gửi link đặt lại
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-muted hover:text-primary">
            ← Về đăng nhập
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
