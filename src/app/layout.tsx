import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/auth/AuthGate";
import { DemoBanner } from "@/components/layout/DemoBanner";
import { APP } from "@/constants";
import { AuthProvider } from "@/store/auth-store";
import { FloorProvider } from "@/store/floor-store";
import { MenuProvider } from "@/store/menu-store";
import { PosProvider } from "@/store/pos-store";
import { SessionTagsProvider } from "@/store/session-tags-store";
import { SettingsProvider } from "@/store/settings-store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP.nameJa,
  description: APP.description,
  /** Preview / hearing: do not index until production launch. */
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP.name,
  },
  formatDetection: {
    telephone: false,
  },
};

/** Match production mobile shell: device width + notch safe-area. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Mobile app shell (本番 AppShell の h-dvh 相当):
        fixed inset-0 でアドレスバー伸縮でも底ナビが追従。
        DemoBanner は上の safe-area、残りを Auth/AppShell が埋める。
      */}
      <body className="h-full overflow-hidden bg-zinc-50 text-zinc-900">
        <div className="fixed inset-0 flex flex-col overflow-hidden">
          <DemoBanner />
          <AuthProvider>
            <AuthGate>
              <SettingsProvider>
                <FloorProvider>
                  <SessionTagsProvider>
                    <MenuProvider>
                      <PosProvider>{children}</PosProvider>
                    </MenuProvider>
                  </SessionTagsProvider>
                </FloorProvider>
              </SettingsProvider>
            </AuthGate>
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
