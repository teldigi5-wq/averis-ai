import type { Metadata } from "next";

import NewReviewClient from "./NewReviewClient";

export const metadata: Metadata = {
  title: "New Review — Averis 2.0",
  description: "Evidence-first document similarity review using the certified Averis API flow.",
};

export default function Averis2NewReviewPage() {
  return <NewReviewClient />;
}
