import type { Metadata } from "next";
import PlayerJoin from "@/screens/PlayerJoin";

export const metadata: Metadata = { title: "Join a game" };

export default function Page() {
  return <PlayerJoin />;
}
