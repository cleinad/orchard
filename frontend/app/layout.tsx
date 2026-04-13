import type { Metadata } from "next";
import { Fraunces, Newsreader } from "next/font/google";
import BodyFontSync from "@/app/components/BodyFontSync";
import {
  BODY_FONT_STACK,
  BODY_FONT_STORAGE_KEY,
  DEFAULT_BODY_FONT_ID,
  LEGACY_BODY_FONT_ID,
} from "@/lib/body-font";
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

const newsreader = Newsreader({
  variable: "--font-body-newsreader",
  subsets: ["latin"],
  display: "swap",
  weight: "variable",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Keen",
  description: "Hands Off AI",
};

const themeBootstrapScript = `(function(){try{var root=document.documentElement;var stored=localStorage.getItem('${STORAGE_KEY}');var modes=${JSON.stringify(THEME_MODE_BY_ID)};var legacy=${JSON.stringify(LEGACY_THEME_ID_MAP)};var prefers=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=(stored&&modes[stored]?stored:(stored&&legacy[stored]?legacy[stored]:null))||(prefers?'${DEFAULT_DARK_THEME_ID}':'${DEFAULT_LIGHT_THEME_ID}');var isDark=modes[theme]==='dark';root.dataset.theme=theme;root.classList.toggle('dark',isDark);root.style.colorScheme=isDark?'dark':'light';if(stored&&legacy[stored]&&stored!==legacy[stored]){localStorage.setItem('${STORAGE_KEY}',legacy[stored]);}}catch(e){}})();`;

const bodyFontBootstrapScript = `(function(){try{var root=document.documentElement;var key='${BODY_FONT_STORAGE_KEY}';var stacks=${JSON.stringify(BODY_FONT_STACK)};var legacy=${JSON.stringify(LEGACY_BODY_FONT_ID)};var def='${DEFAULT_BODY_FONT_ID}';var raw=localStorage.getItem(key);var stored=raw&&legacy[raw]?legacy[raw]:raw;if(raw&&legacy[raw]&&raw!==legacy[raw]){localStorage.setItem(key,legacy[raw]);}var id=stacks.hasOwnProperty(stored)?stored:def;root.dataset.bodyFont=id;root.style.setProperty('--font-body',stacks[id],'important');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={newsreader.variable} suppressHydrationWarning>
      <body className={`${fraunces.variable} ${newsreader.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootstrapScript,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: bodyFontBootstrapScript,
          }}
        />
        <BodyFontSync />
        {children}
      </body>
    </html>
  );
}
