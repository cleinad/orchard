import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Novus",
  description: "Hands Off AI",
};

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
            __html: `(function(){try{var stored=localStorage.getItem('novus-theme');var prefers=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var isDark=stored==='dark'||(stored!=='light'&&prefers);document.documentElement.classList.toggle('dark',isDark);}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
