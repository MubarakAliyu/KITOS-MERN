import { Plus_Jakarta_Sans, Space_Mono, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import SessionProviderWrapper from "@/_components/providers/SessionProviderWrapper";
import { ThemeProvider } from "@/_components/providers/ThemeProvider";
import { MountedProvider } from "@/_components/providers/MountedProvider";
import { MSWProvider } from "@/_components/providers/MSWProvider";
import { LanguageProvider } from "@/_lib/i18n/LanguageContext";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-code",
  display: "swap",
});

export const metadata = {
  title: {
    default: "Kids In Tech LMS",
    template: "%s | Kids In Tech LMS",
  },
  description:
    "Kids In Tech learning portal — courses, lessons, and progress tracking for students, parents, instructors, and admins.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_LMS_URL || "https://lms.kidsintech.school"),
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${spaceMono.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <LanguageProvider>
            <MountedProvider>
              <MSWProvider>
                <SessionProviderWrapper>
                  {children}
                  <Toaster richColors position="top-right" />
                </SessionProviderWrapper>
              </MSWProvider>
            </MountedProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
