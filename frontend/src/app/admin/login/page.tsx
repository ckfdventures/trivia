import type { Metadata } from "next";
import Login from "@/screens/Login";

export const metadata: Metadata = { title: "Admin sign in" };

export default function Page() {
  return <Login />;
}
