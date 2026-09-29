import type { Metadata } from "next";
import PlayerLobby from "@/screens/PlayerLobby";

export const metadata: Metadata = { title: "Lobby" };

export default function Page() {
  return <PlayerLobby />;
}
