import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { SITE_CONFIG } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Kiểm tra email của bạn để nhận magic link.");
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="font-inter text-2xl font-bold dark:text-white">Đăng nhập portal beta</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Nhập email để nhận magic link. Portal web đang hỗ trợ lớp tài khoản và quản trị,
            còn trải nghiệm tracking chính vẫn hoạt động qua {SITE_CONFIG.primaryChannelLabel}.
          </p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Đang gửi..." : "Gửi magic link"}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Chưa cần portal? Bạn vẫn có thể dùng trực tiếp CaloTrack qua Telegram tại{" "}
          <a
            href={SITE_CONFIG.telegramBotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-600 hover:underline"
          >
            CaloTrack Bot
          </a>
          .
        </div>
      </div>
    </div>
  );
}
