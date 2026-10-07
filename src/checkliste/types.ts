/** Datentypen der Checklisten-App — entsprechen dem API-Vertrag in docs/LIVE-PLAN.md §2.5. */

export type Phase = 'vor' | 'nach';
export type Owner = 'team' | 'josie' | 'beide';
export type Status = 'offen' | 'in_arbeit' | 'erledigt' | 'verworfen';
export type Priority = 'blocker' | 'wichtig' | 'normal';
export type Role = 'team' | 'inhaberin';
export type CommentKind = 'feedback' | 'frage' | 'antwort';

export interface Item {
  id: string;
  title: string;
  description: string;
  phase: Phase;
  owner: Owner;
  assignee?: string;
  status: Status;
  priority: Priority;
  category: string;
  link?: string;
  createdAt: string;
  updatedAt: string;
  /** user-id oder 'seed' */
  updatedBy: string;
}

export interface Comment {
  id: string;
  itemId: string;
  userId: string;
  userName: string;
  role: Role;
  text: string;
  kind: CommentKind;
  resolved: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface ChecklistData {
  items: Item[];
  comments: Comment[];
}

export type FuerFilter = 'alle' | 'team' | 'josie';
export type PhaseFilter = 'vor' | 'nach' | 'alle';
export type StatusFilter = 'offen' | 'erledigt' | 'alle';

export interface Filters {
  fuer: FuerFilter;
  phase: PhaseFilter;
  status: StatusFilter;
}

export interface NewItemInput {
  title: string;
  description?: string;
  phase: Phase;
  owner: Owner;
  priority?: Priority;
  category?: string;
}
