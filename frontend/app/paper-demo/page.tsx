import type { Metadata } from "next";
import PaperDemoShell from "@/app/paper-demo/components/PaperDemoShell";

export const metadata: Metadata = {
  title: "Paper threads · Orchard",
  description: "A local PDF highlighting and research-thread prototype.",
};

export default function PaperDemoPage() {
  return <PaperDemoShell />;
}
