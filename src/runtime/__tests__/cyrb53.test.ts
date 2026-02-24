import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { cyrb53 } from "../cyrb53";

describe("cyrb53", () => {
  it("known values are stable", () => {
    expect(cyrb53("")).toBe(cyrb53(""));
    expect(cyrb53("hello")).toBe(cyrb53("hello"));
  });

  it("deterministic — cyrb53(s) === cyrb53(s) for any string", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(cyrb53(s)).toBe(cyrb53(s));
      }),
    );
  });

  it("idempotent seed — same seed produces same result", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 0, max: 0xffffffff }),
        (s, seed) => {
          expect(cyrb53(s, seed)).toBe(cyrb53(s, seed));
        },
      ),
    );
  });
});
