// A template re-mounts on every navigation between app screens, so each new screen fades in
// gently (no delay, no fake loading). Back / forward and links work exactly as before.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="anim-page flex min-w-0 flex-1 flex-col">{children}</div>;
}
