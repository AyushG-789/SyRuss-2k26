// Material Symbols Outlined icon (font loaded in app/layout.tsx). Names: fonts.google.com/icons
export default function Icon({ name, className = "", fill = false }: { name: string; className?: string; fill?: boolean }) {
  return (
    <span className={`material-symbols-outlined ${fill ? "icon-fill" : ""} ${className}`} aria-hidden>
      {name}
    </span>
  );
}
