import { USE_MOCKS } from "@/lib/api";

export default function MockBanner() {
  if (!USE_MOCKS) return null;
  return (
    <div className="border-b border-warn/40 bg-warn-soft px-4 py-2 text-center text-sm text-warn">
      <strong>MOCK DATA</strong> — numbers are placeholders until the routing engine is connected.
    </div>
  );
}
