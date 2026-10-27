import type { Metadata } from "next";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <DemoBanner />
        <AuthProvider>
          <AuthGate>
            <SettingsProvider>
              <FloorProvider>
                <SessionTagsProvider>
                  <MenuProvider>
                    <PosProvider>
                      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
                      <footer className="border-t border-zinc-200 px-4 py-3 text-center text-xs text-zinc-500">
                        {APP.copyright} · vvelt.xyz
                      </footer>
                    </PosProvider>
                  </MenuProvider>
                </SessionTagsProvider>
              </FloorProvider>
            </SettingsProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
