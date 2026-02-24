/** In-memory mock data for the blog example */

export interface TagRecord {
  id: string;
  name: string;
}

export interface AuthorRecord {
  id: string;
  name: string;
  bio: string | null;
}

export interface CommentRecord {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  postId: string;
}

export interface PostRecord {
  id: string;
  title: string;
  content: string;
  publishedAt: string | null;
  authorId: string;
  tagIds: string[];
}

export const tags: TagRecord[] = [
  { id: "t1", name: "TypeScript" },
  { id: "t2", name: "GraphQL" },
  { id: "t3", name: "Node.js" },
];

export const authors: AuthorRecord[] = [
  { id: "a1", name: "Alice", bio: "Full-stack developer" },
  { id: "a2", name: "Bob", bio: null },
];

export const posts: PostRecord[] = [
  {
    id: "p1",
    title: "Getting Started with TypeScript",
    content: "TypeScript adds static typing to JavaScript...",
    publishedAt: "2024-01-15",
    authorId: "a1",
    tagIds: ["t1", "t3"],
  },
  {
    id: "p2",
    title: "GraphQL Best Practices",
    content: "When designing a GraphQL API...",
    publishedAt: "2024-02-20",
    authorId: "a1",
    tagIds: ["t2", "t3"],
  },
  {
    id: "p3",
    title: "Type-safe GraphQL Clients",
    content: "Using code generation to get end-to-end type safety...",
    publishedAt: null,
    authorId: "a2",
    tagIds: ["t1", "t2"],
  },
];

export const comments: CommentRecord[] = [
  {
    id: "c1",
    body: "Great introduction!",
    createdAt: "2024-01-16",
    authorId: "a2",
    postId: "p1",
  },
  {
    id: "c2",
    body: "Very helpful, thanks.",
    createdAt: "2024-01-17",
    authorId: "a1",
    postId: "p1",
  },
  {
    id: "c3",
    body: "Looking forward to the next part.",
    createdAt: "2024-02-21",
    authorId: "a2",
    postId: "p2",
  },
];
