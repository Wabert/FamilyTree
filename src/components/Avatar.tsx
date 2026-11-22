import type { Person } from "@/lib/types";

const TINTS = [
  ["#e3efe7", "#23513c"],
  ["#f4e3d7", "#8a4226"],
  ["#e4e7f5", "#3b4a8c"],
  ["#f3ead0", "#7a5c12"],
  ["#eadff0", "#6a3f82"],
  ["#dcecf0", "#256070"],
];

function tintFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ person, size }: { person: Pick<Person, "id" | "name" | "photo">; size: number }) {
  const [bg, fg] = tintFor(person.id);
  if (person.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-supplied data URL
      <img
        src={person.photo}
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.36 }}
    >
      {initials(person.name)}
    </span>
  );
}

export function lifespan(person: Pick<Person, "birthYear" | "deathYear">): string {
  const { birthYear, deathYear } = person;
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (deathYear) return `d. ${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  return "";
}
