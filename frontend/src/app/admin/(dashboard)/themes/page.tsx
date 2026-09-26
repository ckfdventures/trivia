import type { Metadata } from "next";
import Themes from "@/screens/admin/Themes";

export const metadata: Metadata = { title: "Themes" };

export default function Page() {
  return <Themes />;
}
