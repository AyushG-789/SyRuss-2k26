// A stable anonymous reporter id for this browser. Pakka Check treats an id it has never seen as a
// brand-new account (weight 0.05) — that's the anti-gaming rule, not a bug.

export function reporterId(): string {
  try {
    const existing = localStorage.getItem("travelbuddy.reporter");
    if (existing) return existing;
    const id = `web_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("travelbuddy.reporter", id);
    return id;
  } catch {
    return "web_anonymous";
  }
}
