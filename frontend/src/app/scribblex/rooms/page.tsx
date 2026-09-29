import type { Metadata } from "next";
import Rooms from "@/screens/scribblex/Rooms";

export const metadata: Metadata = { title: "Live rooms" };

export default function Page() {
  return <Rooms />;
}
