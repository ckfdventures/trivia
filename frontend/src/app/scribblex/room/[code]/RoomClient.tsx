"use client";

import dynamic from "next/dynamic";

/** Client-only for the same reason as the profile screen: the seat lives in `localStorage`. */
const Room = dynamic(() => import("@/screens/scribblex/Room"), {
  ssr: false,
  loading: () => <div className="min-h-screen sx-dots" />,
});

export default function RoomClient() {
  return <Room />;
}
