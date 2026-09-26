import type { Metadata } from "next";
import QuestionBank from "@/screens/admin/QuestionBank";

export const metadata: Metadata = { title: "Upload questions" };

export default function Page() {
  return <QuestionBank />;
}
