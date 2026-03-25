import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  LEGACY_THEME_ID_MAP,
  STORAGE_KEY,
  THEME_MODE_BY_ID,
} from "@/lib/theme";
import "katex/dist/katex.min.css";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Keen",
  description: "Hands Off AI",
};

const themeBootstrapScript = `(function(){try{var root=document.documentElement;var stored=localStorage.getItem('${STORAGE_KEY}');var modes=${JSON.stringify(THEME_MODE_BY_ID)};var legacy=${JSON.stringify(LEGACY_THEME_ID_MAP)};var prefers=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=(stored&&modes[stored]?stored:(stored&&legacy[stored]?legacy[stored]:null))||(prefers?'${DEFAULT_DARK_THEME_ID}':'${DEFAULT_LIGHT_THEME_ID}');var isDark=modes[theme]==='dark';root.dataset.theme=theme;root.classList.toggle('dark',isDark);root.style.colorScheme=isDark?'dark':'light';if(stored&&legacy[stored]&&stored!==legacy[stored]){localStorage.setItem('${STORAGE_KEY}',legacy[stored]);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
        {children}
      </body>
    </html>
  );
}
