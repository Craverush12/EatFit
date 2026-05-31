import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FitPlate — Eat right for your body",
  description:
    "Enter your BMI and goals. Get personalised food and grocery picks from Swiggy, calibrated to your calorie and macro targets. Add to cart in one tap.",
  openGraph: {
    title: "FitPlate — Eat right for your body",
    description: "BMI-based food planner powered by Swiggy MCP + Groq AI.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full antialiased font-sans">{children}</body>
    </html>
  );
}
