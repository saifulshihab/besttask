import { createContext, useContext, useMemo, type ReactNode } from "react";

type Person = { email: string; avatar?: string | null };

/** email → photo, for people whose photo the app has already loaded. */
const Directory = createContext<ReadonlyMap<string, string>>(new Map());

/**
 * Makes the photos of `people` available to every Avatar inside it. The API
 * leaves photos out where it embeds a person in other data (a task's
 * assignee, a comment's author, an activity entry's actor), because each photo
 * is inline image data; Avatar fills them in from here. Nested directories add
 * to the outer one, so the app-wide one (you) and a project's (its members)
 * combine.
 */
export function AvatarDirectory({ people, children }: { people: readonly Person[]; children: ReactNode }) {
  const outer = useContext(Directory);
  const map = useMemo(() => {
    const next = new Map(outer);
    for (const p of people) if (p.avatar) next.set(p.email.toLowerCase(), p.avatar);
    return next;
  }, [outer, people]);
  return <Directory.Provider value={map}>{children}</Directory.Provider>;
}

/** The person's photo: their own if present, else one from a directory above. */
export function usePhoto(person: Person) {
  const directory = useContext(Directory);
  return person.avatar || directory.get(person.email.toLowerCase()) || null;
}
