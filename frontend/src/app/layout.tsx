import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PLATFORM_NAME } from "@/lib/brand";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: PLATFORM_NAME, template: `%s · ${PLATFORM_NAME}` },
  description:
    "Live multiplayer party games. Share a link, play on any phone, no downloads and no signups.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The platform shell's ink, not either game's colour — this is the chrome around both.
  themeColor: "#17161A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
