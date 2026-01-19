import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404 Not Found Page
 * Custom styled page for missing routes
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-8xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Không tìm thấy trang
        </h2>
        <p className="text-muted mb-8 max-w-md">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/">
            <Button size="lg">🏠 Về trang chủ</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline">📊 Dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
