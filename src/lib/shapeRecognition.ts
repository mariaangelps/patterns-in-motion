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

function pointToLineDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

// Order points by angle from centroid
function orderByAngle(pts: Point[]): Point[] {
  const c = centroid(pts);
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)
  );
}

// Check circularity
function isCircle(points: Point[]): { match: boolean; confidence: number } {
  if (points.length < 10) return { match: false, confidence: 0 };

  const c = centroid(points);
  const distances = points.map((p) => dist(p, c));
  const avgR = distances.reduce((a, b) => a + b, 0) / distances.length;

  if (avgR < 15) return { match: false, confidence: 0 };

  const deviations = distances.map((d) => Math.abs(d - avgR) / avgR);
  const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;

  // Check if path is closed
  const closeDist = dist(points[0], points[points.length - 1]);
  const isClosed = closeDist < avgR * 0.5;

  if (!isClosed || avgDev > 0.25) return { match: false, confidence: 0 };

  const confidence = Math.round(Math.max(0, (1 - avgDev / 0.25) * 100));
  return { match: confidence > 40, confidence };
}

// Detect shape from simplified vertices
function classifyPolygon(vertices: Point[]): RecognizedShape | null {
  const n = vertices.length;

  if (n === 2) {
    const d = dist(vertices[0], vertices[1]);
    if (d < 20) return null;
    return {
      type: "LÍNEA",
      confidence: 90,
      vertices: 2,
      description: `Longitud: ${Math.round(d)}px`,
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
    let subtype = "TRIÁNGULO";
    let conf = 70;

    if (sideRatio > 0.85) {
      subtype = "TRIÁNGULO EQUILÁTERO";
      conf = 85 + sideRatio * 15;
    } else if (Math.abs(sides[0] - sides[1]) / sides[2] < 0.15 || Math.abs(sides[1] - sides[2]) / sides[2] < 0.15) {
      subtype = "TRIÁNGULO ISÓSCELES";
      conf = 80;
    }

    // Check for right angle
    const hasRight = angles.some((a) => Math.abs(a - Math.PI / 2) < 0.2);
    if (hasRight) {
      subtype = "TRIÁNGULO RECTÁNGULO";
      conf = 85;
    }

    return {
      type: subtype,
      confidence: Math.min(99, Math.round(conf)),
      vertices: 3,
      description: `3 vértices · ${sides.map((s) => Math.round(s) + "px").join(" × ")}`,
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
      angles.push(angleBetween(ordered[(i + 3) % 4], ordered[i], ordered[(i + 1) % 4]));
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
        type: "CUADRADO",
        confidence: Math.min(99, Math.round(70 + sideRatio * 20 + (1 - maxAngleDiff) * 10)),
        vertices: 4,
        description: `4 vértices · ángulos ~90°`,
        points: ordered,
        color: "hsla(280, 60%, 55%, 1)",
      };
    }

    if (isRectish) {
      return {
        type: "RECTÁNGULO",
        confidence: Math.min(99, Math.round(75 + (1 - maxAngleDiff / 0.35) * 25)),
        vertices: 4,
        description: `4 vértices · ${Math.round(sideMin)}×${Math.round(sideMax)}px`,
        points: ordered,
        color: "hsla(210, 70%, 55%, 1)",
      };
    }

    if (sideRatio > 0.7) {
      return {
        type: "ROMBO",
        confidence: Math.min(99, Math.round(65 + sideRatio * 30)),
        vertices: 4,
        description: `4 vértices · lados similares`,
        points: ordered,
        color: "hsla(330, 70%, 55%, 1)",
      };
    }

    return {
      type: "CUADRILÁTERO",
      confidence: 60,
      vertices: 4,
      description: `4 vértices irregulares`,
      points: ordered,
      color: "hsla(50, 60%, 50%, 1)",
    };
  }

  if (n === 5) {
    return {
      type: "PENTÁGONO",
      confidence: 70,
      vertices: 5,
      description: `5 vértices detectados`,
      points: orderByAngle(vertices),
      color: "hsla(145, 70%, 50%, 1)",
    };
  }

  if (n === 6) {
    return {
      type: "HEXÁGONO",
      confidence: 70,
      vertices: 6,
      description: `6 vértices detectados`,
      points: orderByAngle(vertices),
      color: "hsla(200, 80%, 55%, 1)",
    };
  }

  if (n > 6) {
    return {
      type: `POLÍGONO (${n})`,
      confidence: 50,
      vertices: n,
      description: `${n} vértices detectados`,
      points: orderByAngle(vertices),
      color: "hsla(60, 60%, 50%, 1)",
    };
  }

  return null;
}

export function recognizeFromPoints(points: Point[]): RecognizedShape | null {
  if (points.length < 2) return null;
  if (points.length <= 6) return classifyPolygon(points);

  // Free-draw: first check if circle
  const circleCheck = isCircle(points);
  if (circleCheck.match) {
    const c = centroid(points);
    const avgR = points.reduce((s, p) => s + dist(p, c), 0) / points.length;
    return {
      type: "CÍRCULO",
      confidence: circleCheck.confidence,
      vertices: 0,
      description: `Radio ≈ ${Math.round(avgR)}px`,
      points: [c],
      color: "hsla(175, 80%, 50%, 1)",
    };
  }

  // Simplify and classify polygon
  const perim = perimeter(points);
  const epsilon = Math.max(8, perim * 0.04);
  const simplified = rdp(points, epsilon);

  // Remove last point if it's close to first (closed shape)
  let verts = simplified;
  if (verts.length > 2 && dist(verts[0], verts[verts.length - 1]) < perim * 0.1) {
    verts = verts.slice(0, -1);
  }

  return classifyPolygon(verts);
}
