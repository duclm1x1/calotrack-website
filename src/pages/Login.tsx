import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SITE_CONFIG } from "@/lib/siteConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to dashboard
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
      toast.success("Check your email for the magic link!");
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl shadow-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold font-inter dark:text-white">Đăng nhập portal beta</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            Nhập email để nhận magic link. Sản phẩm chính vẫn đang chạy trên {SITE_CONFIG.primaryChannelLabel}.
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
          Chưa cần portal? Bạn có thể dùng trực tiếp trên Telegram tại{" "}
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
