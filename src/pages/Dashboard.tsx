import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { SITE_CONFIG } from "@/lib/siteConfig";

const readinessItems = [
  {
    title: "Sản phẩm chính",
    value: "Telegram-first",
    detail: "Theo dõi dinh dưỡng, ảnh món ăn, /mode, /clear, stats và billing đều đang ưu tiên chạy trên Telegram.",
  },
  {
    title: "Portal khách hàng",
    value: "Beta",
    detail: "Web portal chưa là nguồn dữ liệu chính. Identity linking với bot sẽ được mở ở phase sau.",
  },
  {
    title: "Thanh toán",
    value: "Hybrid",
    detail: "Nâng cấp gói được thiết kế theo hướng payment online + kích hoạt tự động + admin fallback khi cần.",
  },
];

const nextSteps = [
  "Mở Telegram bot để dùng sản phẩm chính ngay bây giờ.",
  "Nếu cần nâng cấp Pro hoặc Lifetime, dùng CTA thanh toán hoặc liên hệ support.",
  "Portal web sẽ được mở rộng sau khi identity linking và SaaS schema production đã ổn định.",
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const email = user?.email || "Chưa có email";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 w-full">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
              Customer Portal Beta
            </p>
            <h1 className="text-3xl font-bold text-zinc-950 dark:text-white">
              Portal web đang ở chế độ beta an toàn
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Tài khoản này đã đăng nhập thành công, nhưng CaloTrack hiện vẫn là sản phẩm
              chat-first. Dữ liệu dinh dưỡng và entitlement production vẫn xoay quanh bot,
              còn portal web sẽ mở rộng sau khi identity linking hoàn chỉnh.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild className="bg-[#229ED9] text-white hover:bg-[#1d90c4]">
              <a href={SITE_CONFIG.telegramBotUrl} target="_blank" rel="noopener noreferrer">
                Mở Telegram bot
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={SITE_CONFIG.pricingAnchor}>Xem bảng giá</a>
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const { supabase } = await import("@/lib/supabase");
                await supabase.auth.signOut();
                navigate("/");
              }}
            >
              Đăng xuất
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {readinessItems.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{item.title}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">{item.value}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Trạng thái tài khoản web</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex flex-col gap-1 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <dt className="text-zinc-500 dark:text-zinc-400">Email đăng nhập</dt>
                <dd className="font-medium text-zinc-950 dark:text-white">{email}</dd>
              </div>
              <div className="flex flex-col gap-1 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                <dt className="text-zinc-500 dark:text-zinc-400">Nguồn dữ liệu chính</dt>
                <dd className="font-medium text-zinc-950 dark:text-white">
                  Bot trên {SITE_CONFIG.primaryChannelLabel}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-zinc-500 dark:text-zinc-400">Hỗ trợ</dt>
                <dd className="font-medium text-zinc-950 dark:text-white">{SITE_CONFIG.supportEmail}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Bước tiếp theo</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {nextSteps.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
