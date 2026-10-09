"use client";

// Opens and closes its content smoothly (height via CSS grid rows, see .tb-collapse in globals.css).
// Closed content stays in the page but is inert, so it can't be tabbed into or read out.

export default function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="tb-collapse" data-open={open}>
      <div inert={!open} aria-hidden={!open}>{children}</div>
    </div>
  );
}
