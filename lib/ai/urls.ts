export function publicUrl(value: string): boolean {
  try {
    const u = new URL(value),
      h = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !h.includes(":") &&
      !/^\d+\./.test(h) &&
      !h.endsWith(".local") &&
      !h.endsWith(".internal") &&
      h !== "localhost" &&
      h.includes(".")
    );
  } catch {
    return false;
  }
}
