import type { Metadata } from "next";
import ScribbleXIntro from "@/screens/scribblex/ScribbleXIntro";

export const metadata: Metadata = { title: "ScribbleX" };

export default function Page() {
  return <ScribbleXIntro />;
}
