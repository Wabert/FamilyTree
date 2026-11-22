export type Gender = "male" | "female" | "other";

/** How many extra photos each person can have besides their profile picture. */
export const MAX_GALLERY = 4;

/** A node in the tree. A person exists whether or not anyone has an account for them. */
export interface Person {
  id: string;
  name: string;
  /** What the family actually calls them, e.g. "Bobby" or "Nana". */
  nickname?: string;
  gender?: Gender;
  birthYear?: number;
  deathYear?: number;
  /** Data URL for now; becomes a storage URL once photos live in Supabase. */
  photo?: string;
  /** Up to MAX_GALLERY extra photos shown on their details screen (data or storage URLs). */
  gallery?: string[];
  location?: string;
  bio?: string;
  /** The account that added this person (shared trees only). */
  createdBy?: string;
}

/** The only two relationship types we store. Everything else is derived. */
export interface ParentLink {
  parentId: string;
  childId: string;
}

/**
 * Married, divorced, or partners who never married. A marriage that ended
 * because one of them died stays "married": their death year says the rest.
 */
export type MarriageStatus = "married" | "divorced" | "partners";

export interface SpouseLink {
  aId: string;
  bId: string;
  /** Missing means married. */
  status?: MarriageStatus;
  /** Year they married or got together. */
  startYear?: number;
  /** Year they divorced or split up. */
  endYear?: number;
}

export interface Family {
  name: string;
  people: Person[];
  parentLinks: ParentLink[];
  spouseLinks: SpouseLink[];
}
