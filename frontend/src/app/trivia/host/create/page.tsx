import type { Metadata } from "next";
import HostSetup from "@/screens/HostSetup";

export const metadata: Metadata = { title: "Host a game" };

export default function Page() {
  return <HostSetup />;
}
