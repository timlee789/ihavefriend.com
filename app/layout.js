import "./globals.css";

export const metadata = {
  title: "AI Companion — Your Personal AI Friend",
  description: "A friendly AI companion that remembers you and grows with you.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
