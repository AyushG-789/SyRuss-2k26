import { Suspense } from "react";
import RouteResults from "@/components/RouteResults";
import { getTraveller, TRAVELLER_IDS } from "@/lib/api";

// Pre-build one results page per demo traveller (/routes/TR1 … /routes/TR5).
export function generateStaticParams() {
  return TRAVELLER_IDS.map((travellerId) => ({ travellerId }));
}

export default function DemoRoutesPage(props: PageProps<"/routes/[travellerId]">) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-7xl px-6 py-6 text-on-surface-variant">Finding routes…</p>}>
      <ForTraveller params={props.params} />
    </Suspense>
  );
}

async function ForTraveller({ params }: { params: PageProps<"/routes/[travellerId]">["params"] }) {
  const { travellerId } = await params;
  return <RouteResults traveller={getTraveller(travellerId) ?? null} />;
}
