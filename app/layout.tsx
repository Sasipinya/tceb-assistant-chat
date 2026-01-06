import type { Metadata } from "next";
import "./globals.css";
import { prompt } from "./fonts"


export const metadata: Metadata = {
  title: "Thailand Convention and Exhibition Bureau – Providing MICE Solutions in Thailand",
  description: "The Thailand Convention and Exhibition Bureau is the premier MICE organizer in Thailand with a wealth of experience in providing MICE solutions and promoting MICE venues in Thailand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={prompt.variable}>
      <body
        className={`${prompt.variable}  antialiased`}
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  );
}
