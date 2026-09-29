import type { Metadata } from "next";
import RoomClient from "./RoomClient";

export const metadata: Metadata = { title: "Room" };

export default function Page() {
  return <RoomClient />;
}
