import { Kanit, Sarabun, Pridi,Prompt } from "next/font/google";

export const kanit = Kanit({
  subsets: ["thai"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-kanit",
  display: "swap",
});

export const sarabun = Sarabun({
  subsets: ["thai"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

export const pridi = Pridi({
  subsets: ["thai"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-pridi",
  display: "swap",
});
export const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"], 
  variable: "--font-prompt",
  display: "swap",
});
