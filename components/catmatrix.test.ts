import { rotateAbout, translateX, translateXScaleY } from "./catmatrix";

describe("translateXScaleY", () => {
  it("matches translateX when the eyes are fully open", () => {
    expect(translateXScaleY(4, 1, 128)).toEqual([1, 0, 0, 1, 4, 0]);
  });

  it("keeps the eye line fixed while squashing toward it", () => {
    const oy = 128;
    const [a, b, c, d, tx, ty] = translateXScaleY(0, 0.25, oy);
    expect(a * 0 + c * oy + tx).toBeCloseTo(0);
    expect(b * 0 + d * oy + ty).toBeCloseTo(oy);
    // A point 20 above the eye line ends up 5 above it.
    expect(b * 0 + d * (oy - 20) + ty).toBeCloseTo(oy - 5);
  });

  it("collapses to the eye line when shut", () => {
    const [, , , d, , ty] = translateXScaleY(-6, 0, 128);
    expect(d).toBe(0);
    expect(ty).toBe(128);
  });
});

describe("translateX", () => {
  it("is the identity when there is no offset", () => {
    expect(translateX(0)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("puts the horizontal offset in the tx slot only", () => {
    expect(translateX(5)).toEqual([1, 0, 0, 1, 5, 0]);
    expect(translateX(-2.5)).toEqual([1, 0, 0, 1, -2.5, 0]);
  });
});

describe("rotateAbout", () => {
  it("is the identity at zero degrees", () => {
    const m = rotateAbout(0, 112, 120);
    expect(m[0]).toBeCloseTo(1);
    expect(m[1]).toBeCloseTo(0);
    expect(m[2]).toBeCloseTo(0);
    expect(m[3]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(0);
    expect(m[5]).toBeCloseTo(0);
  });

  it("leaves the pivot point fixed under rotation", () => {
    const ox = 112;
    const oy = 120;
    const [a, b, c, d, tx, ty] = rotateAbout(30, ox, oy);
    // Applying the affine to the pivot must return the pivot unchanged.
    const px = a * ox + c * oy + tx;
    const py = b * ox + d * oy + ty;
    expect(px).toBeCloseTo(ox);
    expect(py).toBeCloseTo(oy);
  });

  it("rotates a point below the pivot to the expected place", () => {
    // A point 44 units below the pivot, rotated +90°, lands 44 units to the
    // left in SVG coords (y grows downward, so +deg is clockwise on screen).
    const ox = 112;
    const oy = 120;
    const [a, b, c, d, tx, ty] = rotateAbout(90, ox, oy);
    const px = a * ox + c * (oy + 44) + tx;
    const py = b * ox + d * (oy + 44) + ty;
    expect(px).toBeCloseTo(ox - 44);
    expect(py).toBeCloseTo(oy);
  });
});
