import type { Family, Gender, ParentLink, Person, SpouseLink } from "./types";

const people: Person[] = [];
const parentLinks: ParentLink[] = [];
const spouseLinks: SpouseLink[] = [];

function person(
  id: string,
  name: string,
  gender: Gender,
  birthYear: number,
  extra: Partial<Person> = {},
): string {
  people.push({ id, name, gender, birthYear, ...extra });
  return id;
}

function marry(aId: string, bId: string) {
  spouseLinks.push({ aId, bId });
}

function childrenOf(parents: string[], children: string[]) {
  for (const parentId of parents) {
    for (const childId of children) parentLinks.push({ parentId, childId });
  }
}

// Generation 1
person("walter", "Walter Hartley", "male", 1932, {
  deathYear: 2011,
  location: "Dayton, Ohio",
  bio: "Machinist, fisherman, and the reason every Hartley knows how to whistle.",
});
person("rose", "Rose Hartley", "female", 1935, {
  deathYear: 2019,
  location: "Dayton, Ohio",
  bio: "Taught third grade for 31 years. Her peach cobbler recipe is still argued over.",
});
marry("walter", "rose");

// Generation 2
person("margaret", "Margaret Okafor", "female", 1956, { location: "Columbus, Ohio" });
person("thomas", "Thomas Okafor", "male", 1954, { location: "Columbus, Ohio" });
person("david", "David Hartley", "male", 1959, { location: "Dayton, Ohio" });
person("linda", "Linda Hartley", "female", 1961, { location: "Dayton, Ohio" });
person("susan", "Susan Alvarez", "female", 1963, { location: "Tucson, Arizona" });
person("robert", "Robert Alvarez", "male", 1960, { location: "Tucson, Arizona" });
marry("margaret", "thomas");
marry("david", "linda");
marry("susan", "robert");
childrenOf(["walter", "rose"], ["margaret", "david", "susan"]);

// Generation 3
person("daniel", "Daniel Okafor", "male", 1980, { location: "Chicago, Illinois" });
person("priya", "Priya Okafor", "female", 1982, { location: "Chicago, Illinois" });
person("grace", "Grace Okafor", "female", 1984, { location: "Portland, Oregon" });
person("emily", "Emily Reed", "female", 1986, { location: "Cincinnati, Ohio" });
person("marcus", "Marcus Reed", "male", 1985, { location: "Cincinnati, Ohio" });
person("james", "James Hartley", "male", 1989, { location: "Dayton, Ohio" });
person("sofia", "Sofia Alvarez", "female", 1990, { location: "Denver, Colorado" });
person("mateo", "Mateo Alvarez", "male", 1993, { location: "Tucson, Arizona" });
person("hannah", "Hannah Alvarez", "female", 1994, { location: "Tucson, Arizona" });
marry("daniel", "priya");
marry("emily", "marcus");
marry("mateo", "hannah");
childrenOf(["margaret", "thomas"], ["daniel", "grace"]);
childrenOf(["david", "linda"], ["emily", "james"]);
childrenOf(["susan", "robert"], ["sofia", "mateo"]);

// Generation 4
person("maya", "Maya Okafor", "female", 2010);
person("leo", "Leo Okafor", "male", 2013);
person("oliver", "Oliver Reed", "male", 2015);
person("ruby", "Ruby Reed", "female", 2018);
person("nora", "Nora Alvarez", "female", 2022);
childrenOf(["daniel", "priya"], ["maya", "leo"]);
childrenOf(["emily", "marcus"], ["oliver", "ruby"]);
childrenOf(["mateo", "hannah"], ["nora"]);

/** A made-up family so the app has something to show before real data is entered. */
export const sampleFamily: Family = {
  name: "The Hartley Family",
  people,
  parentLinks,
  spouseLinks,
};
