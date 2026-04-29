export const metadata = {
  title: "Use AI API",
  description: "Simple API wrapper deployed on Vercel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
