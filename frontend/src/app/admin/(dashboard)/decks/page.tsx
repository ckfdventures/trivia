import type { Metadata } from "next";
import WordDecks from "@/screens/admin/WordDecks";

export const metadata: Metadata = { title: "Word decks" };

export default function Page() {
  return <WordDecks />;
}
