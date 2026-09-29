import { VfsError } from "./types.js";

export function normalizeVirtualPath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new VfsError("Path must be a non-empty string");
  }
  const absolute = path.startsWith("/") ? path : `/${path}`;
  const parts = absolute.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) throw new VfsError(`Path escapes virtual root: ${path}`);
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join("/")}`.replace(/\/$/, "") || "/";
}

export function joinVirtualPath(...parts: string[]): string {
  return normalizeVirtualPath(parts.filter((part) => part.length > 0).join("/"));
}

export function parentVirtualPath(path: string): string {
  const normalized = normalizeVirtualPath(path);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

