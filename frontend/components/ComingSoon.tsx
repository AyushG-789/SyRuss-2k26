import Link from "next/link";
import Icon from "./Icon";

/** Placeholder for screens in the design that aren't built yet. */
export default function ComingSoon({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <main className="flex w-full flex-1 items-start justify-center px-4 py-10 md:px-6">
      <section className="flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl bg-container-lowest p-8 text-center shadow-sm">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-fixed text-on-primary-fixed">
          <Icon name={icon} className="text-[28px]" />
        </span>
        <span className="rounded-full bg-container px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Coming soon</span>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-on-surface-variant">{text}</p>
        <Link href="/" className="btn-primary mt-2"><Icon name="hub" /> Back to Transit Hub</Link>
      </section>
    </main>
  );
}
