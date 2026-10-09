import { Suspense } from "react";
import EventDetail from "@/components/EventDetail";

// /events/<id> — why Pakka Check trusts (or doesn't trust) one problem. Ids are created live, so
// the page reads its param inside Suspense and the component fetches the detail.
export default function EventPage(props: PageProps<"/events/[id]">) {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-on-surface-variant">Loading…</p>}>
      <ForEvent params={props.params} />
    </Suspense>
  );
}

async function ForEvent({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const { id } = await params;
  return <EventDetail id={decodeURIComponent(id)} />;
}
