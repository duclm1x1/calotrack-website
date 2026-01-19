"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Global Error Boundary
 * Catches unhandled errors across the app
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html>
      <body className="bg-zinc-950 text-zinc-50">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <span className="text-6xl mb-4 block">💥</span>
            <h1 className="text-2xl font-bold mb-2">Lỗi nghiêm trọng</h1>
            <p className="text-zinc-400 mb-6">
              Ứng dụng gặp lỗi không mong muốn. Vui lòng thử lại.
            </p>
            <Button onClick={reset}>Thử lại</Button>
          </div>
        </div>
      </body>
    </html>
  );
}
