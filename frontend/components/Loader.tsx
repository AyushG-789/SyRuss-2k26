// Small "three stops lighting up" loading indicator with its message (for screen readers too).
export default function Loader({ label, className = "" }: { label: string; className?: string }) {
  return (
    <p role="status" className={`flex items-center gap-3 text-on-surface-variant ${className}`}>
      <span className="loader-dots" aria-hidden><span /><span /><span /></span>
      {label}
    </p>
  );
}
