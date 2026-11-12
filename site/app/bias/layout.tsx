import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BiasShell } from "@/components/bias/shell";
import "./bias.css";

const title = "Verafy Bias Detector";
const description = "Immutable bias report cards and evals for open and closed source models.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, siteName: title },
  twitter: { card: "summary", title, description },
  icons: {
    icon: [{ url: "/header/logos/bias-detector-32.png?v=2", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/header/logos/bias-detector-512.png?v=2" }],
  },
};

export default function BiasLayout({ children }: { children: ReactNode }) {
  return <BiasShell>{children}</BiasShell>;
}
