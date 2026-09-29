import type { Metadata } from "next";
import HostLobby from "@/screens/HostLobby";

export const metadata: Metadata = { title: "Lobby" };

export default function Page() {
  return <HostLobby />;
}
