"use client";

import dynamic from "next/dynamic";

// import dinamico lato client, così evitiamo qualsiasi problema di import/default
const Coface = dynamic(
  () => import("../components/CofaceDashboard.jsx").then(m => m.default),
  { ssr: false }
);

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-100">
      <Coface />
    </main>
  );
}
