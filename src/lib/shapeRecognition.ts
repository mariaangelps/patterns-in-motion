export interface Point {
  x: number;
  y: number;
}

export interface RecognizedShape {
  type: string;
  confidence: number;
  vertices: number;
  description: string;
  points: Point[];
  color: string;
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(pts: Point[]): Point {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function perimeter(pts: Point[]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    total += dist(pts[i], pts[(i + 1) % pts.length]);
  }
  return total;
}

function angleBetween(a: Point, b: Point, c: Point): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  return Math.atan2(Math.abs(cross), dot);
}

function pointToLineDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

// Simplify a drawn path using Ramer-Douglas-Peucker
function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDist(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

// Order points by angle from centroid
function orderByAngle(pts: Point[]): Point[] {
  const c = centroid(pts);
  return [...pts].sort(
    (a, b) =>
      Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)
  );
}

function bbox(pts: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Shoelace area (expects polygon order)
function polygonArea(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - a.y * b.x;
  }
  return Math.abs(sum) / 2;
}

// Convex hull (Monotonic chain). Returns hull points in CCW order.
function convexHull(points: Point[]): Point[] {
  if (points.length <= 3) return points;

  const pts = [...points].sort((p1, p2) => (p1.x - p2.x) || (p1.y - p2.y));
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ---------- Circle / Oval detection (robust) ----------
function circleOrOval(points: Point[]): {
  type: "CIRCLE" | "OVAL" | null;
  confidence: number;
  extra?: string;
} {
  if (points.length < 8) return { type: null, confidence: 0 };

  // closure check — generous for hand-drawn
  const closeDist = dist(points[0], points[points.length - 1]);
  const perim = perimeter(points);
  const isClosed = closeDist < Math.max(40, perim * 0.15);
  if (!isClosed) return { type: null, confidence: 0 };

  // simplify a bit for area
  const eps = Math.max(4, perim * 0.015);
  let poly = rdp(points, eps);
  if (poly.length > 2 && dist(poly[0], poly[poly.length - 1]) < perim * 0.12) {
    poly = poly.slice(0, -1);
  }
  // Even rough circles should have several simplified points
  if (poly.length < 5) return { type: null, confidence: 0 };

  poly = orderByAngle(poly);

  const A = polygonArea(poly);
  const P = perim;
  if (A <= 0 || P <= 0) return { type: null, confidence: 0 };

  // circularity: perfect circle = 1
  const circ = (4 * Math.PI * A) / (P * P);

  const box = bbox(points);
  const minSide = Math.max(1, Math.min(box.w, box.h));
  const maxSide = Math.max(box.w, box.h);
  const ar = maxSide / minSide; // aspect ratio >= 1

  // radius constancy
  const c = centroid(points);
  const ds = points.map((p) => dist(p, c));
  const avgR = ds.reduce((a, b) => a + b, 0) / ds.length;
  if (avgR < 10) return { type: null, confidence: 0 };
  const avgDev =
    ds.map((d) => Math.abs(d - avgR) / avgR).reduce((a, b) => a + b, 0) /
    ds.length;

  // Hard minimum: if circularity is terrible, it's not round at all
  if (circ < 0.45) return { type: null, confidence: 0 };

  // ---------- Circle score ----------
  const sCirc = clamp01((circ - 0.55) / (0.95 - 0.55));
  const sARCircle = clamp01((1.40 - ar) / (1.40 - 1.0));
  const sDev = clamp01((0.35 - avgDev) / (0.35 - 0.08));
  const circleScore = sCirc > 0 ? sCirc * 0.50 + sARCircle * 0.25 + sDev * 0.25 : 0;

  // ---------- Oval score ----------
  const sOvalCirc = clamp01((circ - 0.50) / (0.85 - 0.50));
  const sAROval = clamp01((ar - 1.15) / (2.5 - 1.15));
  const sOvalDev = clamp01((0.45 - avgDev) / (0.45 - 0.10));
  const ovalScore = sOvalCirc > 0 ? sOvalCirc * 0.45 + sAROval * 0.30 + sOvalDev * 0.25 : 0;

  if (circleScore < 0.30 && ovalScore < 0.30)
    return { type: null, confidence: 0 };

  if (circleScore >= ovalScore && ar < 1.5) {
    return {
      type: "CIRCLE",
      confidence: Math.min(99, Math.round(55 + circleScore * 44)),
      extra: `circularity ${circ.toFixed(2)} · AR ${ar.toFixed(2)} · dev ${avgDev.toFixed(2)}`,
    };
  }

  if (ovalScore >= 0.30) {
    return {
      type: "OVAL",
      confidence: Math.min(99, Math.round(50 + ovalScore * 49)),
      extra: `circularity ${circ.toFixed(2)} · AR ${ar.toFixed(2)} · dev ${avgDev.toFixed(2)}`,
    };
  }

  return { type: null, confidence: 0 };
}

// ---------- Star detection (concavity via hull ratio) ----------
function isStarLike(points: Point[]): {
  match: boolean;
  confidence: number;
  simplifiedCount: number;
  concavityRatio: number;
} {
  if (points.length < 20) {
    return {
      match: false,
      confidence: 0,
      simplifiedCount: 0,
      concavityRatio: 1,
    };
  }

  const perim = perimeter(points);
  const eps = Math.max(5, perim * 0.015);
  let poly = rdp(points, eps);

  if (poly.length > 2 && dist(poly[0], poly[poly.length - 1]) < perim * 0.08) {
    poly = poly.slice(0, -1);
  }
  if (poly.length < 8) {
    return {
      match: false,
      confidence: 0,
      simplifiedCount: poly.length,
      concavityRatio: 1,
    };
  }

  poly = orderByAngle(poly);
  const A = polygonArea(poly);
  if (A <= 0) {
    return {
      match: false,
      confidence: 0,
      simplifiedCount: poly.length,
      concavityRatio: 1,
    };
  }

  const hull = convexHull(poly);
  const Ah = polygonArea(hull);
  if (Ah <= 0) {
    return {
      match: false,
      confidence: 0,
      simplifiedCount: poly.length,
      concavityRatio: 1,
    };
  }

  const ratio = A / Ah; // convex ~ 1, star smaller
  // score ramps up as ratio goes down
  const score = clamp01((0.92 - ratio) / (0.92 - 0.62));

  if (score < 0.28) {
    return {
      match: false,
      confidence: 0,
      simplifiedCount: poly.length,
      concavityRatio: ratio,
    };
  }

  return {
    match: true,
    confidence: Math.min(99, Math.round(60 + score * 39)),
    simplifiedCount: poly.length,
    concavityRatio: ratio,
  };
}

// ---------- Polygon classification helpers ----------
function regularityScore(ordered: Point[]): number {
  // measures how equal the side lengths are (1 = perfect)
  const n = ordered.length;
  if (n < 3) return 0;
  const sides: number[] = [];
  for (let i = 0; i < n; i++) {
    sides.push(dist(ordered[i], ordered[(i + 1) % n]));
  }
  const avg = sides.reduce((a, b) => a + b, 0) / sides.length;
  if (avg <= 0) return 0;
  const dev =
    sides.map((s) => Math.abs(s - avg) / avg).reduce((a, b) => a + b, 0) /
    sides.length;
  return clamp01(1 - dev / 0.35);
}

// Detect shape from simplified vertices
function classifyPolygon(vertices: Point[]): RecognizedShape | null {
  const n = vertices.length;

  if (n === 2) {
    const d = dist(vertices[0], vertices[1]);
    if (d < 20) return null;
    return {
      type: "LINE",
      confidence: 90,
      vertices: 2,
      description: `Length: ${Math.round(d)}px`,
      points: vertices,
      color: "hsla(175, 80%, 50%, 1)",
    };
  }

  if (n === 3) {
    const ordered = orderByAngle(vertices);
    const sides = [
      dist(ordered[0], ordered[1]),
      dist(ordered[1], ordered[2]),
      dist(ordered[2], ordered[0]),
    ].sort((a, b) => a - b);

    if (sides[0] < 15) return null;

    const angles = [
      angleBetween(ordered[2], ordered[0], ordered[1]),
      angleBetween(ordered[0], ordered[1], ordered[2]),
      angleBetween(ordered[1], ordered[2], ordered[0]),
    ];

    const sideRatio = sides[0] / sides[2];
    let subtype = "TRIANGLE";
    let conf = 70;

    if (sideRatio > 0.85) {
      subtype = "EQUILATERAL TRIANGLE";
      conf = 85 + sideRatio * 15;
    } else if (
      Math.abs(sides[0] - sides[1]) / sides[2] < 0.15 ||
      Math.abs(sides[1] - sides[2]) / sides[2] < 0.15
    ) {
      subtype = "ISOSCELES TRIANGLE";
      conf = 80;
    }

    const hasRight = angles.some((a) => Math.abs(a - Math.PI / 2) < 0.2);
    if (hasRight) {
      subtype = "RIGHT TRIANGLE";
      conf = 85;
    }

    return {
      type: subtype,
      confidence: Math.min(99, Math.round(conf)),
      vertices: 3,
      description: `3 vertices · ${sides
        .map((s) => Math.round(s) + "px")
        .join(" × ")}`,
      points: ordered,
      color: "hsla(35, 90%, 55%, 1)",
    };
  }

  if (n === 4) {
    const ordered = orderByAngle(vertices);
    const sides: number[] = [];
    const angles: number[] = [];

    for (let i = 0; i < 4; i++) {
      sides.push(dist(ordered[i], ordered[(i + 1) % 4]));
      angles.push(
        angleBetween(
          ordered[(i + 3) % 4],
          ordered[i],
          ordered[(i + 1) % 4]
        )
      );
    }

    const sideMin = Math.min(...sides);
    const sideMax = Math.max(...sides);
    const sideRatio = sideMin / sideMax;

    const rightAngle = Math.PI / 2;
    const angleDiffs = angles.map((a) => Math.abs(a - rightAngle));
    const maxAngleDiff = Math.max(...angleDiffs);
    const isRectish = maxAngleDiff < 0.35;

    if (isRectish && sideRatio > 0.8) {
      return {
        type: "SQUARE",
        confidence: Math.min(
          99,
          Math.round(70 + sideRatio * 20 + (1 - maxAngleDiff) * 10)
        ),
        vertices: 4,
        description: `4 vertices · angles ~90°`,
        points: ordered,
        color: "hsla(280, 60%, 55%, 1)",
      };
    }

    if (isRectish) {
      return {
        type: "RECTANGLE",
        confidence: Math.min(
          99,
          Math.round(75 + (1 - maxAngleDiff / 0.35) * 25)
        ),
        vertices: 4,
        description: `4 vertices · ${Math.round(sideMin)}×${Math.round(
          sideMax
        )}px`,
        points: ordered,
        color: "hsla(210, 70%, 55%, 1)",
      };
    }

    if (sideRatio > 0.7) {
      return {
        type: "DIAMOND",
        confidence: Math.min(99, Math.round(65 + sideRatio * 30)),
        vertices: 4,
        description: `4 vertices · similar sides`,
        points: ordered,
        color: "hsla(330, 70%, 55%, 1)",
      };
    }

    return {
      type: "QUADRILATERAL",
      confidence: 60,
      vertices: 4,
      description: `4 irregular vertices`,
      points: ordered,
      color: "hsla(50, 60%, 50%, 1)",
    };
  }

  // Regular polygons 5+
  if (n >= 5) {
    const ordered = orderByAngle(vertices);
    const reg = regularityScore(ordered);
    const base = 62 + reg * 30;

    const nameByN: Record<number, string> = {
      5: "PENTAGON",
      6: "HEXAGON",
      7: "HEPTAGON",
      8: "OCTAGON",
      9: "NONAGON",
      10: "DECAGON",
      11: "HENDECAGON",
      12: "DODECAGON",
      13: "TRIDECAGON",
      14: "TETRADECAGON",
      15: "PENTADECAGON",
      16: "HEXADECAGON",
    };

    const label = nameByN[n] ?? `POLYGON (${n})`;
    const conf = Math.min(99, Math.round(n <= 16 ? base : 50 + reg * 20));

    return {
      type: label,
      confidence: conf,
      vertices: n,
      description: `${n} vertices detected · regularity ${(reg * 100).toFixed(
        0
      )}%`,
      points: ordered,
      color: n <= 6 ? "hsla(200, 80%, 55%, 1)" : "hsla(60, 60%, 50%, 1)",
    };
  }

  return null;
}

// ---------- Heart detection ----------
function isHeart(points: Point[]): { match: boolean; confidence: number } {
  if (points.length < 15) return { match: false, confidence: 0 };

  const perim = perimeter(points);
  const closeDist = dist(points[0], points[points.length - 1]);
  const isClosed = closeDist < Math.max(40, perim * 0.15);
  if (!isClosed) return { match: false, confidence: 0 };

  const box = bbox(points);
  const ar = box.w / Math.max(1, box.h);

  // Heart: roughly square to slightly wider or taller
  if (ar < 0.5 || ar > 1.8) return { match: false, confidence: 0 };
  if (box.w < 30 || box.h < 30) return { match: false, confidence: 0 };

  const centerX = (box.minX + box.maxX) / 2;

  // Find the bottommost point
  let bottomIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].y > points[bottomIdx].y) bottomIdx = i;
  }
  const bottom = points[bottomIdx];

  // Bottom tip should be roughly centered (relaxed)
  const xOffsetRatio = Math.abs(bottom.x - centerX) / box.w;
  if (xOffsetRatio > 0.25) return { match: false, confidence: 0 };

  // Bottom tip should be in the lower portion
  const yBottomRatio = (bottom.y - box.minY) / box.h;
  if (yBottomRatio < 0.70) return { match: false, confidence: 0 };

  // Check for two lobes: points in top 50% of shape
  const topThreshold = box.minY + box.h * 0.50;
  const topPoints = points.filter((p) => p.y < topThreshold);
  const leftTop = topPoints.filter((p) => p.x < centerX);
  const rightTop = topPoints.filter((p) => p.x >= centerX);

  if (leftTop.length < 3 || rightTop.length < 3)
    return { match: false, confidence: 0 };

  // Find peaks of each lobe
  const leftPeak = leftTop.reduce((a, b) => (a.y < b.y ? a : b));
  const rightPeak = rightTop.reduce((a, b) => (a.y < b.y ? a : b));

  // Both peaks must be in top 45%
  const leftPeakRatio = (leftPeak.y - box.minY) / box.h;
  const rightPeakRatio = (rightPeak.y - box.minY) / box.h;
  if (leftPeakRatio > 0.45 || rightPeakRatio > 0.45)
    return { match: false, confidence: 0 };

  // Check for a dip between lobes at top center
  const topCenterPoints = topPoints.filter(
    (p) => Math.abs(p.x - centerX) < box.w * 0.18
  );

  let dipScore = 0;
  if (topCenterPoints.length > 0) {
    const topCenterLowest = topCenterPoints.reduce((a, b) =>
      a.y > b.y ? a : b
    );
    const avgPeakY = (leftPeak.y + rightPeak.y) / 2;
    const dipAmount = topCenterLowest.y - avgPeakY;

    if (dipAmount > box.h * 0.05) {
      dipScore = clamp01(dipAmount / (box.h * 0.25));
    }
  }

  // Also check: the shape narrows toward the bottom (V shape)
  const bottomQuarter = points.filter((p) => p.y > box.minY + box.h * 0.75);
  const topQuarter = points.filter((p) => p.y < box.minY + box.h * 0.35);
  if (bottomQuarter.length > 0 && topQuarter.length > 0) {
    const bottomWidth =
      Math.max(...bottomQuarter.map((p) => p.x)) -
      Math.min(...bottomQuarter.map((p) => p.x));
    const topWidth =
      Math.max(...topQuarter.map((p) => p.x)) -
      Math.min(...topQuarter.map((p) => p.x));
    // Top should be wider than bottom (heart narrows downward)
    const narrowRatio = topWidth > 0 ? bottomWidth / topWidth : 1;
    if (narrowRatio < 0.75) {
      // Good V-shape toward bottom
      const vScore = clamp01((0.75 - narrowRatio) / 0.50);
      const totalScore = dipScore * 0.6 + vScore * 0.4;
      if (totalScore > 0.15) {
        const conf = Math.round(65 + totalScore * 34);
        return { match: true, confidence: Math.min(99, conf) };
      }
    }
  }

  // If dip alone is strong enough
  if (dipScore > 0.35) {
    const conf = Math.round(65 + dipScore * 30);
    return { match: true, confidence: Math.min(99, conf) };
  }

  return { match: false, confidence: 0 };
}

export function recognizeFromPoints(points: Point[]): RecognizedShape | null {
  if (points.length < 2) return null;

  // If user is in "points mode" and gives just a few points
  if (points.length <= 6) return classifyPolygon(points);

  // 1) Circle / Oval first
  const co = circleOrOval(points);
  if (co.type) {
    const c = centroid(points);
    const avgR = points.reduce((s, p) => s + dist(p, c), 0) / points.length;
    return {
      type: co.type,
      confidence: co.confidence,
      vertices: 0,
      description:
        co.type === "CIRCLE"
          ? `Radius ≈ ${Math.round(avgR)}px · ${co.extra ?? ""}`
          : `Oval · ${co.extra ?? ""}`,
      points: [c],
      color: "hsla(175, 80%, 50%, 1)",
    };
  }

  // 2) Heart detection (after circle/oval, before star/polygon)
  const heart = isHeart(points);
  if (heart.match) {
    return {
      type: "HEART",
      confidence: heart.confidence,
      vertices: 0,
      description: `Heart shape detected`,
      points: [centroid(points)],
      color: "hsla(350, 85%, 55%, 1)",
    };
  }

  // 3) Star check (concave)
  const star = isStarLike(points);
  if (star.match) {
    const perim = perimeter(points);
    const eps = Math.max(5, perim * 0.015);
    let poly = rdp(points, eps);
    if (
      poly.length > 2 &&
      dist(poly[0], poly[poly.length - 1]) < perim * 0.08
    ) {
      poly = poly.slice(0, -1);
    }
    poly = orderByAngle(poly);

    return {
      type: "STAR",
      confidence: star.confidence,
      vertices: poly.length,
      description: `Concave · ratio ${star.concavityRatio.toFixed(2)} · ${
        poly.length
      } pts`,
      points: poly,
      color: "hsla(45, 90%, 60%, 1)",
    };
  }

  // 4) Simplify and classify polygon
  const perim = perimeter(points);
  const epsilon = Math.max(8, perim * 0.04);
  const simplified = rdp(points, epsilon);

  let verts = simplified;
  if (
    verts.length > 2 &&
    dist(verts[0], verts[verts.length - 1]) < perim * 0.1
  ) {
    verts = verts.slice(0, -1);
  }

  return classifyPolygon(verts);
}