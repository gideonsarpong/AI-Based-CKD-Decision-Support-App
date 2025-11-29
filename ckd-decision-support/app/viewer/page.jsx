import { Suspense } from "react";
import ViewerClient from "./ViewerClient";

export default function ViewerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading protocol viewer...</div>}>
      <ViewerClient />
    </Suspense>
  );
}
