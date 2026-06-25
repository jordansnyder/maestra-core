import { describe, it, expect } from "vitest";
import { friendlyMessage, parseDockerError, toFriendlyError } from "./errors";

describe("friendlyMessage", () => {
  it("maps known error kinds to user-facing copy", () => {
    expect(friendlyMessage("DockerNotRunning")).toMatch(/Docker isn't running/);
    expect(friendlyMessage("DiskSpaceLow")).toMatch(/disk space/i);
  });

  it("falls back for unknown kinds", () => {
    // @ts-expect-error — exercising the runtime fallback path
    expect(friendlyMessage("SomethingElse")).toBe("An unexpected error occurred.");
  });
});

describe("parseDockerError", () => {
  it("parses a JSON-string Tauri error", () => {
    const parsed = parseDockerError(
      JSON.stringify({ kind: "PortConflict", message: "port busy" })
    );
    expect(parsed).toEqual({ kind: "PortConflict", message: "port busy" });
  });

  it("accepts an already-structured object", () => {
    const parsed = parseDockerError({ kind: "StartFailed", message: "boom" });
    expect(parsed?.kind).toBe("StartFailed");
  });

  it("returns null for plain strings and junk", () => {
    expect(parseDockerError("just a string")).toBeNull();
    expect(parseDockerError(42)).toBeNull();
    expect(parseDockerError(null)).toBeNull();
  });
});

describe("toFriendlyError", () => {
  it("prefers the structured message", () => {
    expect(
      toFriendlyError(JSON.stringify({ kind: "PullFailed", message: "no net" }))
    ).toBe("no net");
  });

  it("passes through raw strings", () => {
    expect(toFriendlyError("raw failure")).toBe("raw failure");
  });

  it("has a final fallback", () => {
    expect(toFriendlyError(undefined)).toBe("An unexpected error occurred.");
  });
});
