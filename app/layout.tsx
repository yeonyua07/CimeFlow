import type { Metadata, Viewport } from "next";
import StyledProvider from "@/app/_components/Layout/Styled/StyledProvider";
import StyledThemeProvider from "./_components/Layout/Styled/StyledThemeProvider";
import { GoogleAnalytics } from "@next/third-parties/google";
import "@/styles/globals.css";

export const viewport: Viewport = {
  themeColor: "#0B0A0F",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: "CimeFlow - ci.me 라이브 참여 콘솔",
  description: "ci.me 채팅 기반 추첨, 투표, 룰렛 진행을 위한 오픈소스 라이브 참여 콘솔입니다",
  openGraph: {
    title: "CimeFlow - ci.me 라이브 참여 콘솔",
    description: "ci.me 채팅 기반 추첨, 투표, 룰렛 진행을 위한 오픈소스 라이브 참여 콘솔입니다",
    type: "website",
    locale: "ko_KR",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    images: [{ url: "/og-image.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <StyledProvider>
          <StyledThemeProvider>{children}</StyledThemeProvider>
        </StyledProvider>
      </body>
      <GoogleAnalytics gaId="G-FH3J6K7Z1Y" />
    </html>
  );
}
