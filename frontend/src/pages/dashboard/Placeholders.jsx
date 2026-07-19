import React from "react";
import { Compass, Storefront } from "@phosphor-icons/react";

export function Discover() {
  return <Placeholder title="Discover" copy="Browse community-made quizzes." Icon={Compass} testId="discover-placeholder" />;
}

export function Marketplace() {
  return <Placeholder title="Marketplace" copy="Buy and sell premium question packs." Icon={Storefront} testId="marketplace-placeholder" />;
}

function Placeholder({ title, copy, Icon, testId }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest font-black text-indigo-500">Dashboard</div>
      <h1 className="font-display text-4xl sm:text-5xl font-black text-indigo-950 mt-1">{title}</h1>
      <div className="mt-8 rounded-3xl border-2 border-dashed border-indigo-200 p-12 text-center bg-white" data-testid={testId}>
        <div className="mx-auto h-16 w-16 rounded-2xl bg-orange-100 grid place-items-center">
          <Icon size={28} weight="fill" className="text-orange-500" />
        </div>
        <h3 className="font-display font-black text-2xl text-indigo-950 mt-4">Coming soon</h3>
        <p className="text-indigo-950/60 font-semibold mt-2 max-w-md mx-auto">{copy}</p>
      </div>
    </div>
  );
}
