import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.10),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px]">
        <div className="rounded-[32px] border border-primary/10 bg-white/80 p-8 shadow-md backdrop-blur">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Customer portal beta
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Đăng nhập portal để xem account, billing và lớp dashboard đang mở rộng dần
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            CaloTrack vẫn là sản phẩm chat-first. Portal web giúp bạn quản lý account, entitlement, quota,
            payment và những lớp điều hành cần thiết để hệ thống đi đúng hướng SaaS.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Primary channel</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{SITE_CONFIG.primaryChannelLabel}</div>
              <div className="mt-1 text-sm text-muted-foreground">Tracking live mạnh nhất hiện tại.</div>
            </div>
            <div className="rounded-2xl border border-accent/15 bg-accent/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Next channel</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{SITE_CONFIG.secondaryChannelLabel}</div>
              <div className="mt-1 text-sm text-muted-foreground">{SITE_CONFIG.secondaryChannelStatus}.</div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Portal role</div>
              <div className="mt-2 text-lg font-semibold text-foreground">Account + billing</div>
              <div className="mt-1 text-sm text-muted-foreground">Đăng nhập, quota, plan và admin surfaces.</div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-primary/10 bg-white/88 p-8 shadow-md backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Nhận magic link</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhập email để mở portal. Nếu bạn chỉ muốn tracking ngay, có thể vào thẳng Telegram trước.
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

          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Portal không thay thế tracking trong chat. Nó tồn tại để làm rõ account, pricing, payment và lớp
            điều hành khi CaloTrack mở rộng.
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            Muốn dùng ngay?{" "}
            <a
              href={getPrimaryChannelHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
            >
              Mở CaloTrack trên Telegram
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
