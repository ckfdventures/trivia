"use client";

import dynamic from "next/dynamic";

/**
 * The profile screen identifies the player from `localStorage`, so there is nothing
 * meaningful to server-render — and rendering it on the server would only produce markup the
 * client immediately replaces. Loading it client-side lets the screen read storage during its
 * first render instead of hydrating from an effect.
 */
const Profile = dynamic(() => import("@/screens/scribblex/Profile"), {
  ssr: false,
  loading: () => <div className="min-h-screen sx-dots" />,
});

export default function ProfileClient() {
  return <Profile />;
}
