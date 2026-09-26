import type { Metadata } from "next";
import PlayerGame from "@/screens/PlayerGame";

export const metadata: Metadata = { title: "Live game" };

export default function Page() {
  return <PlayerGame />;
}
