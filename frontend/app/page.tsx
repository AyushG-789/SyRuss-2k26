import MockBanner from "@/components/MockBanner";
import TravellerCard from "@/components/TravellerCard";
import { travellers } from "@/lib/api";

export default function Home() {
  return (
    <>
      <MockBanner />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8">
        <section className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Locals tell you the truth. We fact-check them.
          </h1>
          <p className="max-w-2xl text-muted">
            TravelBuddy plans door-to-door trips across Mumbai’s locals, metro, BEST buses and taxis — using
            verified commuter reports, news and official alerts, not just the timetable.
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="ask">
          <h2 id="ask" className="mb-2 text-sm font-semibold">
            Plan a trip
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              disabled
              placeholder="e.g. Thane to Wankhede by 6:30, under ₹150"
              className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted disabled:cursor-not-allowed"
            />
            <div className="flex gap-1" role="group" aria-label="Language">
              {["EN", "हिं", "मरा"].map((l) => (
                <button key={l} disabled className="rounded-lg border border-line px-3 py-2 text-sm text-muted disabled:cursor-not-allowed">
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">Typing and voice requests are coming soon. Pick a demo traveller below.</p>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="demo">
          <h2 id="demo" className="text-lg font-semibold">
            Demo travellers
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {travellers.map((t) => (
              <TravellerCard key={t.traveller_id} traveller={t} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
