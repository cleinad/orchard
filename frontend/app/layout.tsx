import type { Metadata } from "next";
import { Libre_Baskerville, Rubik } from "next/font/google";
import "./globals.css";

const libreBaskerville = Libre_Baskerville({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const rubik = Rubik({
  variable: "--font-body",
  subsets: ["latin"],
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
      <body className={`${libreBaskerville.variable} ${rubik.variable} antialiased`}>
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
