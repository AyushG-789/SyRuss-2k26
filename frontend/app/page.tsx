import MockBanner from "@/components/MockBanner";
import TravellerCard from "@/components/TravellerCard";
import TripForm from "@/components/TripForm";
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

        <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" aria-label="Plan a trip">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                disabled
                placeholder="Coming soon: just say it — “Thane to Wankhede by 6:30, under ₹150”"
                className="flex-1 rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 text-sm placeholder:text-muted disabled:cursor-not-allowed"
              />
              <button disabled className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted disabled:cursor-not-allowed">
                🎤 Voice
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">The AI will fill the form below from your words (English, हिंदी, मराठी). For now, fill it in yourself.</p>
          </div>
          <hr className="border-line" />
          <TripForm />
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="demo">
          <h2 id="demo" className="text-lg font-semibold">
            Or try a demo traveller
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
