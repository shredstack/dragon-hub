import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import { SITE_NAME, siteMetadataBase } from "@/lib/page-metadata";

const inter = Inter({
  subsets: ["latin"],
});

const DESCRIPTION =
  "PTA coordination for school communities — classrooms, volunteering, budget, events, and the knowledge that usually leaves with last year's board.";

export const metadata: Metadata = {
  // Relative Open Graph images and URLs resolve against this. Without it Next
  // warns and emits relative og:image values, which no unfurler will fetch.
  metadataBase: siteMetadataBase(),
  title: {
    // No school name here. The app is multi-school, and this string is what
    // the store listing, the share sheet and every browser tab show — one
    // school's name in it reads as the wrong app to every other school.
    default: SITE_NAME,
    // Every page that exports a `title` gets "<page> · DragonHub", so a shared
    // link says what it is. See src/lib/page-metadata.ts.
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  // Favicon and apple-touch-icon come from src/app/icon.png and
  // src/app/apple-icon.png via Next's file conventions.
  manifest: "/manifest.webmanifest",
  // The fallback card, for any page that doesn't override it. Public pages do,
  // in generateMetadata; pages behind the login wall can't (a crawler is served
  // the sign-in page), which is why this one names no school.
  openGraph: {
    title: SITE_NAME,
    description: DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    images: ["/icons/icon-512.png"],
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: DESCRIPTION,
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#1e40af",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {/* Mounted at the root so any route can call useToast() — a page that
            uses it without a provider in scope throws on render. */}
        <ToastProvider>
          {children}
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
