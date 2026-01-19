import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CaloTrack - Track Calories with AI",
  description: "Theo dõi Calo bằng AI. Chụp ảnh đồ ăn, nhận phân tích dinh dưỡng trong 2 giây qua Telegram, Zalo, Messenger.",
  keywords: ["calo", "calories", "diet", "AI", "nutrition", "vietnam", "giảm cân"],
  authors: [{ name: "CaloTrack Team" }],
  openGraph: {
    title: "CaloTrack - Track Calories with AI",
    description: "Theo dõi Calo bằng AI. Chụp ảnh đồ ăn, nhận phân tích dinh dưỡng trong 2 giây.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
