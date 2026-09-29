import type { Metadata } from "next";
import Landing from "@/screens/Landing";

export const metadata: Metadata = { title: "Trivia" };

export default function Page() {
  return <Landing />;
}
