import { describe, it, expect } from "vitest";
import {
  sourceCoordinates,
  objectPosition,
} from "../apps/web/src/lib/mirror-coordinates";
describe("pointer to face coordinates", () => {
  it("maps a cropped landscape image through its actual object position", () => {
    const p = sourceCoordinates(
      { x: 250, y: 200 },
      { left: 0, top: 0, width: 500, height: 400 },
      { width: 1200, height: 900 },
      { x: 0.5, y: 0.38 },
    );
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo(0.5);
  });
  it("accounts for zoomed canvas boxes instead of assuming screen pixels are image pixels", () => {
    const p = sourceCoordinates(
      { x: 250, y: 250 },
      { left: -250, top: -250, width: 1000, height: 1000 },
      { width: 600, height: 900 },
      { x: 0.5, y: 0.42 },
    );
    expect(p.x).toBeCloseTo(0.5);
    expect(p.y).toBeCloseTo((500 + 210) / 1500);
  });
  it("reads the mobile38% position and explicit edge keywords", () => {
    expect(objectPosition("50% 38%")).toEqual({ x: 0.5, y: 0.38 });
    expect(objectPosition("left top")).toEqual({ x: 0, y: 0 });
  });
  it("maps a complete portrait through side letterboxing", () => {
    const box = { left: 20, top: 30, width: 400, height: 300 },
      source = { width: 600, height: 900 };
    expect(
      sourceCoordinates(
        { x: 220, y: 180 },
        box,
        source,
        { x: 0.5, y: 0.5 },
        "contain",
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
    expect(
      sourceCoordinates(
        { x: 120, y: 30 },
        box,
        source,
        { x: 0.5, y: 0.5 },
        "contain",
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
