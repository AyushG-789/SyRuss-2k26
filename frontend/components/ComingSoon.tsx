"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { M } from "@/lib/i18n/messages/ComingSoon";
import Icon from "./Icon";

type Key = keyof typeof M.en;
/** Page texts we know, by their English wording, so they show in the app language too. */
const KNOWN: Record<string, Key> = Object.fromEntries(
  (Object.keys(M.en) as Key[]).map((k) => [M.en[k], k]),
);

/** Placeholder for screens in the design that aren't built yet. */
export default function ComingSoon({ icon, title, text }: { icon: string; title: string; text: string }) {
  const t = useT(M);
  const tx = (s: string) => (KNOWN[s] ? t(KNOWN[s]) : s);
  return (
    <main className="flex w-full flex-1 items-start justify-center px-4 py-10 md:px-6">
      <section className="flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl bg-container-lowest p-8 text-center shadow-sm">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-fixed text-on-primary-fixed">
          <Icon name={icon} className="text-[28px]" />
        </span>
        <span className="rounded-full bg-container px-2 py-0.5 eyebrow">{t("badge")}</span>
        <h1 className="text-2xl font-bold">{tx(title)}</h1>
        <p className="text-on-surface-variant">{tx(text)}</p>
        <Link href="/" className="btn-primary mt-2"><Icon name="hub" /> {t("back")}</Link>
      </section>
    </main>
  );
}
