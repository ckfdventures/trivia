import type { Metadata } from "next";
import LobbyClient from "./LobbyClient";

export const metadata: Metadata = { title: "Room" };

export default function Page() {
  return <LobbyClient />;
}
