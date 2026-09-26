import { redirect } from "next/navigation";

/** Unknown URLs go back to the landing page, as before. */
export default function NotFound() {
  redirect("/");
}
