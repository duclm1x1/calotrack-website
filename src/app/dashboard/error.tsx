"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Dashboard Error Boundary
 * Catches errors in dashboard routes and provides recovery option
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service (Sentry, LogRocket, etc.)
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-8 pb-6">
          <span className="text-5xl mb-4 block">😵</span>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Có lỗi xảy ra
          </h2>
          <p className="text-muted mb-6">
            Đã có lỗi khi tải trang này. Vui lòng thử lại hoặc liên hệ hỗ trợ.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={reset}>
              🔄 Thử lại
            </Button>
            <a 
              href="/dashboard" 
              className="inline-flex items-center justify-center px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              Về Dashboard
            </a>
          </div>
          {error.digest && (
            <p className="text-xs text-muted mt-4">
              Error ID: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
