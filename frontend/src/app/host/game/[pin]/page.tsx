import type { Metadata } from "next";
import HostGame from "@/screens/HostGame";

export const metadata: Metadata = { title: "Live game" };

export default function Page() {
  return <HostGame />;
}
