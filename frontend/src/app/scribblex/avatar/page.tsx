import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

export const metadata: Metadata = { title: "Pick your sketcher" };

export default function Page() {
  return <ProfileClient />;
}
