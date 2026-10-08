import { Suspense } from "react";
import MockBanner from "@/components/MockBanner";
import PlanView from "@/components/PlanView";
import { TRAVELLER_IDS } from "@/lib/api";

// Pre-build one page per demo traveller (/plan/TR1 … /plan/TR5).
export function generateStaticParams() {
  return TRAVELLER_IDS.map((travellerId) => ({ travellerId }));
}

export default function PlanPage(props: PageProps<"/plan/[travellerId]">) {
  // The banner is the same for every traveller; only the part that reads the URL waits behind Suspense.
  return (
    <>
      <MockBanner />
      <Suspense fallback={<p className="mx-auto w-full max-w-6xl px-4 py-6 text-muted">Finding routes…</p>}>
        <PlanForTraveller params={props.params} />
      </Suspense>
    </>
  );
}

async function PlanForTraveller({ params }: { params: PageProps<"/plan/[travellerId]">["params"] }) {
  const { travellerId } = await params;
  return <PlanView travellerId={travellerId} />;
}
