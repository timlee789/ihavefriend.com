import "./globals.css";
import PWAInit from "@/components/PWAInit";

export const metadata = {
  title: "SayAndKeep — Emma",
  description: "Say it. We keep it. | 말하세요. 간직해드립니다.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SayAndKeep",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#F97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/emma-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SayAndKeep" />
      </head>
      <body>
        <PWAInit />
        {children}
      </body>
    </html>
  );
}
