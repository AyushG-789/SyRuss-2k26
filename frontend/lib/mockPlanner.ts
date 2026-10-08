// Journey Planner defaults and shortcuts. Everything else on the page is live data.

/** Defaults shown in the form — real place names from the covered network. */
export const defaults = {
  from: "Bandra Kurla Complex station",
  to: "CSMT station",
};

/** backend: saved places per user */
export const savedPlaces = [
  { id: "home", title: "Home", sub: "Andheri West", icon: "home", place: "Andheri station" },
  { id: "work", title: "Work", sub: "BKC G-Block", icon: "work", place: "Jio World Centre, BKC" },
];

export const quickChips = [
  { label: "BOM Terminal 2", icon: "flight", place: "Mumbai Airport Terminal 2" },
  { label: "Nariman Point", icon: "account_balance", place: "Churchgate station" },
  { label: "Tech Park Goregaon", icon: "domain", place: "Goregaon station" },
];

