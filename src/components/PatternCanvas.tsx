import { useRef, useEffect, useCallback } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  phase: number;
  connected: boolean;
  patternId: number; // -1 = none
}

export interface DetectedPattern {
  type: string;
  nodeIndices: number[];
  center: { x: number; y: number };
  color: string;
  birth: number;
  confidence: number;
  vertices: number;
  description: string;
}

const SHAPE_COLORS: Record<string, [number, number, number]> = {
  LINE: [175, 80, 50],
  TRIANGLE: [35, 90, 55],
  SQUARE: [280, 60, 55],
  DIAMOND: [330, 70, 55],
  PENTAGON: [145, 70, 50],
  HEXAGON: [210, 80, 60],
};

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  return Math.abs(Math.atan2(cross, dot));
}

function centroid(points: { x: number; y: number }[]) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x: cx, y: cy };
}

function orderByAngle(points: { x: number; y: number; idx: number }[]) {
  const c = centroid(points);
  return [...points].sort(
    (a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)
  );
}

// Check if 3 points form a valid triangle (not too flat, sides roughly proportional)
function isTriangle(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): { valid: boolean; confidence: number } {
  const sides = [dist(a, b), dist(b, c), dist(a, c)].sort((x, y) => x - y);
  const minSide = sides[0];
  const maxSide = sides[2];
  
  // Sides should be between 40-200px
  if (minSide < 40 || maxSide > 200) return { valid: false, confidence: 0 };
  
  // Not too flat: smallest angle > 20 degrees
  const angles = [angle(a, b, c), angle(b, c, a), angle(c, a, b)];
  const minAngle = Math.min(...angles);
  if (minAngle < 0.35) return { valid: false, confidence: 0 }; // ~20 degrees
  
  // Confidence based on how equilateral it is
  const ratio = minSide / maxSide;
  const confidence = 50 + ratio * 50;
  return { valid: true, confidence };
}

// Check if 4 points form a square/rectangle
function isSquare(points: { x: number; y: number; idx: number }[]): { valid: boolean; confidence: number } {
  const ordered = orderByAngle(points);
  const sides: number[] = [];
  const angles: number[] = [];
  
  for (let i = 0; i < 4; i++) {
    const a = ordered[i];
    const b = ordered[(i + 1) % 4];
    const c = ordered[(i + 2) % 4];
    sides.push(dist(a, b));
    angles.push(angle(a, b, c));
  }
  
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (minSide < 35 || maxSide > 200) return { valid: false, confidence: 0 };
  
  // Check angles are roughly 90 degrees (π/2)
  const rightAngle = Math.PI / 2;
  const angleDiffs = angles.map((a) => Math.abs(a - rightAngle));
  const maxAngleDiff = Math.max(...angleDiffs);
  
  if (maxAngleDiff > 0.5) return { valid: false, confidence: 0 }; // ~28 degrees tolerance
  
  const sideRatio = minSide / maxSide;
  const angleAccuracy = 1 - maxAngleDiff / 0.5;
  const confidence = 40 + sideRatio * 30 + angleAccuracy * 30;
  return { valid: true, confidence };
}

// Check if 4 points form a diamond (rhombus - equal sides, non-right angles)
function isDiamond(points: { x: number; y: number; idx: number }[]): { valid: boolean; confidence: number } {
  const ordered = orderByAngle(points);
  const sides: number[] = [];
  
  for (let i = 0; i < 4; i++) {
    sides.push(dist(ordered[i], ordered[(i + 1) % 4]));
  }
  
  const minSide = Math.min(...sides);
  const maxSide = Math.max(...sides);
  if (minSide < 35 || maxSide > 200) return { valid: false, confidence: 0 };
  
  const sideRatio = minSide / maxSide;
  if (sideRatio < 0.6) return { valid: false, confidence: 0 };
  
  // Check diagonals are different lengths (not a square)
  const d1 = dist(ordered[0], ordered[2]);
  const d2 = dist(ordered[1], ordered[3]);
  const diagRatio = Math.min(d1, d2) / Math.max(d1, d2);
  if (diagRatio > 0.9) return { valid: false, confidence: 0 }; // Too square-like
  
  const confidence = 50 + sideRatio * 30 + (1 - diagRatio) * 20;
  return { valid: true, confidence };
}

// Check if 3+ points are roughly collinear  
function isLine(points: { x: number; y: number; idx: number }[]): { valid: boolean; confidence: number } {
  if (points.length < 3) return { valid: false, confidence: 0 };
  
  // Sort by x (or y if vertical)
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const totalDist = dist(sorted[0], sorted[sorted.length - 1]);
  if (totalDist < 80 || totalDist > 350) return { valid: false, confidence: 0 };
  
  // Check deviation from the line connecting first and last
  const dx = sorted[sorted.length - 1].x - sorted[0].x;
  const dy = sorted[sorted.length - 1].y - sorted[0].y;
  const len = Math.hypot(dx, dy);
  
  let maxDev = 0;
  for (let i = 1; i < sorted.length - 1; i++) {
    const px = sorted[i].x - sorted[0].x;
    const py = sorted[i].y - sorted[0].y;
    const dev = Math.abs(px * dy - py * dx) / len;
    maxDev = Math.max(maxDev, dev);
  }
  
  if (maxDev > 15) return { valid: false, confidence: 0 };
  
  // Check spacing is roughly even
  const confidence = 60 + (1 - maxDev / 15) * 40;
  return { valid: true, confidence };
}

export default function PatternCanvas({
  onPatternDetected,
  onPatternsUpdate,
}: {
  onPatternDetected?: (pattern: DetectedPattern) => void;
  onPatternsUpdate?: (patterns: DetectedPattern[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const patternsRef = useRef<DetectedPattern[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const lastDetectRef = useRef(0);

  const initNodes = useCallback((w: number, h: number) => {
    const count = Math.min(100, Math.floor((w * h) / 10000));
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: 2,
        baseRadius: 1.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        connected: false,
        patternId: -1,
      });
    }
    nodesRef.current = nodes;
  }, []);

  const detectPatterns = useCallback(
    (timestamp: number) => {
      if (timestamp - lastDetectRef.current < 1500) return;
      lastDetectRef.current = timestamp;

      const nodes = nodesRef.current;
      // Clear old pattern assignments
      for (const n of nodes) n.patternId = -1;

      // Remove expired patterns
      patternsRef.current = patternsRef.current.filter(
        (p) => timestamp - p.birth < 5000
      );

      const usedNodes = new Set(
        patternsRef.current.flatMap((p) => p.nodeIndices)
      );

      const available = nodes
        .map((n, i) => ({ ...n, idx: i }))
        .filter((_, i) => !usedNodes.has(i));

      if (available.length < 3) return;

      // Try to detect shapes
      let found = false;

      // 1. Try LINES (3-5 collinear nodes)
      if (!found) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const pivot = available[Math.floor(Math.random() * available.length)];
          const nearby = available
            .filter((n) => n.idx !== pivot.idx && dist(n, pivot) < 300)
            .sort((a, b) => dist(a, pivot) - dist(b, pivot));

          for (let count = Math.min(5, nearby.length); count >= 3; count--) {
            const candidates = [pivot, ...nearby.slice(0, count)];
            const result = isLine(candidates);
            if (result.valid) {
              const c = SHAPE_COLORS.LINE;
              const pattern: DetectedPattern = {
                type: "LINE",
                nodeIndices: candidates.map((n) => n.idx),
                center: centroid(candidates),
                color: hsl(c[0], c[1], c[2]),
                birth: timestamp,
                confidence: Math.round(result.confidence),
                vertices: candidates.length,
                description: `${candidates.length} aligned nodes`,
              };
              patternsRef.current.push(pattern);
              onPatternDetected?.(pattern);
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }

      // 2. Try TRIANGLES
      if (!found) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const shuffled = [...available].sort(() => Math.random() - 0.5);
          if (shuffled.length < 3) break;
          const [a, b, c] = shuffled;
          if (dist(a, b) > 200 || dist(b, c) > 200 || dist(a, c) > 200) continue;
          
          const result = isTriangle(a, b, c);
          if (result.valid) {
            const col = SHAPE_COLORS.TRIANGLE;
            const pattern: DetectedPattern = {
              type: "TRIANGLE",
              nodeIndices: [a.idx, b.idx, c.idx],
              center: centroid([a, b, c]),
              color: hsl(col[0], col[1], col[2]),
              birth: timestamp,
              confidence: Math.round(result.confidence),
              vertices: 3,
              description: `3 vertices detected`,
            };
            patternsRef.current.push(pattern);
            onPatternDetected?.(pattern);
            found = true;
            break;
          }
        }
      }

      // 3. Try SQUARES
      if (!found) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const pivot = available[Math.floor(Math.random() * available.length)];
          const nearby = available
            .filter((n) => n.idx !== pivot.idx && dist(n, pivot) < 200)
            .sort((a, b) => dist(a, pivot) - dist(b, pivot));

          if (nearby.length < 3) continue;

          for (let i = 0; i < Math.min(nearby.length, 5); i++) {
            for (let j = i + 1; j < Math.min(nearby.length, 6); j++) {
              for (let k = j + 1; k < Math.min(nearby.length, 7); k++) {
                const pts = [pivot, nearby[i], nearby[j], nearby[k]];
                const sqResult = isSquare(pts);
                if (sqResult.valid) {
                  const col = SHAPE_COLORS.SQUARE;
                  const pattern: DetectedPattern = {
                    type: "SQUARE",
                    nodeIndices: pts.map((n) => n.idx),
                    center: centroid(pts),
                    color: hsl(col[0], col[1], col[2]),
                    birth: timestamp,
                    confidence: Math.round(sqResult.confidence),
                    vertices: 4,
                    description: `4 vertices · ~90° angles`,
                  };
                  patternsRef.current.push(pattern);
                  onPatternDetected?.(pattern);
                  found = true;
                  break;
                }
                const dmResult = isDiamond(pts);
                if (dmResult.valid) {
                  const col = SHAPE_COLORS.DIAMOND;
                  const pattern: DetectedPattern = {
                    type: "DIAMOND",
                    nodeIndices: pts.map((n) => n.idx),
                    center: centroid(pts),
                    color: hsl(col[0], col[1], col[2]),
                    birth: timestamp,
                    confidence: Math.round(dmResult.confidence),
                    vertices: 4,
                    description: `4 vertices · rhombus shape`,
                  };
                  patternsRef.current.push(pattern);
                  onPatternDetected?.(pattern);
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            if (found) break;
          }
          if (found) break;
        }
      }

      // Mark nodes belonging to patterns
      for (const p of patternsRef.current) {
        for (const idx of p.nodeIndices) {
          if (idx < nodes.length) nodes[idx].patternId = 1;
        }
      }

      onPatternsUpdate?.(patternsRef.current);
    },
    [onPatternDetected, onPatternsUpdate]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (nodesRef.current.length === 0) initNodes(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouse);

    const draw = (timestamp: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;

      // Clear with trail
      ctx.fillStyle = "rgba(8, 10, 14, 0.18)";
      ctx.fillRect(0, 0, w, h);

      // Update nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.connected = false;

        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const d = Math.hypot(dx, dy);
        if (d < 250 && d > 1) {
          node.vx += (dx / d) * 0.012;
          node.vy += (dy / d) * 0.012;
        }

        node.vx *= 0.996;
        node.vy *= 0.996;

        if (node.x < 0 || node.x > w) node.vx *= -1;
        if (node.y < 0 || node.y > h) node.vy *= -1;
        node.x = Math.max(0, Math.min(w, node.x));
        node.y = Math.max(0, Math.min(h, node.y));

        node.radius = node.baseRadius + Math.sin(timestamp * 0.002 + node.phase) * 0.8;
      }

      // Draw ambient connections
      const connectionDist = 120;
      ctx.lineWidth = 0.4;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = dist(nodes[i], nodes[j]);
          if (d < connectionDist) {
            const alpha = (1 - d / connectionDist) * 0.15;
            ctx.strokeStyle = hsl(175, 40, 45, alpha);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
            nodes[i].connected = true;
            nodes[j].connected = true;
          }
        }
      }

      // Draw detected patterns
      for (const pattern of patternsRef.current) {
        const age = timestamp - pattern.birth;
        const fadeIn = Math.min(1, age / 600);
        const fadeOut = age > 4000 ? 1 - (age - 4000) / 1000 : 1;
        const alpha = fadeIn * fadeOut;
        if (alpha <= 0) continue;

        const pNodes = pattern.nodeIndices
          .filter((i) => i < nodes.length)
          .map((i) => nodes[i]);

        if (pNodes.length < 2) continue;

        const ordered =
          pNodes.length >= 3
            ? orderByAngle(pNodes.map((n, i) => ({ ...n, idx: i }))).map(
                (o) => pNodes[o.idx]
              )
            : pNodes;

        // Draw shape outline
        ctx.lineWidth = 2;
        ctx.strokeStyle = pattern.color.replace(/[\d.]+\)$/, `${0.7 * alpha})`);
        ctx.shadowColor = pattern.color;
        ctx.shadowBlur = 12 * alpha;

        ctx.beginPath();
        const drawCount = Math.floor(ordered.length * fadeIn);
        for (let i = 0; i <= drawCount && i < ordered.length; i++) {
          const n = ordered[i];
          if (i === 0) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        }
        // Close shape if fully revealed and not a line
        if (fadeIn >= 1 && pattern.type !== "LINE" && ordered.length >= 3) {
          ctx.closePath();
        }
        ctx.stroke();

        // Fill shape lightly
        if (fadeIn >= 1 && pattern.type !== "LINE" && ordered.length >= 3) {
          ctx.fillStyle = pattern.color.replace(/[\d.]+\)$/, `${0.06 * alpha})`);
          ctx.beginPath();
          for (let i = 0; i < ordered.length; i++) {
            if (i === 0) ctx.moveTo(ordered[i].x, ordered[i].y);
            else ctx.lineTo(ordered[i].x, ordered[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }

        ctx.shadowBlur = 0;

        // Highlight vertices
        for (const n of pNodes) {
          ctx.fillStyle = pattern.color.replace(/[\d.]+\)$/, `${0.9 * alpha})`);
          ctx.shadowColor = pattern.color;
          ctx.shadowBlur = 10 * alpha;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4 * fadeIn, 0, Math.PI * 2);
          ctx.fill();

          // Vertex ring
          ctx.strokeStyle = pattern.color.replace(/[\d.]+\)$/, `${0.4 * alpha})`);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 10 * fadeIn, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Label
        if (fadeIn > 0.6) {
          const labelAlpha = Math.min(1, (fadeIn - 0.6) * 5) * fadeOut;
          const cx = pattern.center.x;
          const cy = pattern.center.y - 20;

          // Background
          ctx.fillStyle = `rgba(8, 10, 14, ${0.7 * labelAlpha})`;
          const labelText = pattern.type;
          ctx.font = "bold 11px 'JetBrains Mono', monospace";
          const metrics = ctx.measureText(`▸ ${labelText}`);
          ctx.fillRect(cx - metrics.width / 2 - 8, cy - 10, metrics.width + 16, 32);

          // Type name
          ctx.textAlign = "center";
          ctx.fillStyle = pattern.color.replace(/[\d.]+\)$/, `${labelAlpha})`);
          ctx.fillText(`▸ ${labelText}`, cx, cy + 2);

          // Details
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillStyle = hsl(175, 30, 60, labelAlpha * 0.7);
          ctx.fillText(
            `${pattern.vertices} vertices · ${pattern.confidence}% match`,
            cx,
            cy + 16
          );
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const mouseDist = dist(mouse, node);
        const mouseInfluence = Math.max(0, 1 - mouseDist / 200);
        const inPattern = node.patternId >= 0;

        const brightness = inPattern ? 65 : 45 + mouseInfluence * 25;
        const sat = inPattern ? 70 : 50 + mouseInfluence * 30;
        const nodeAlpha = inPattern ? 0.9 : 0.3 + mouseInfluence * 0.4;

        ctx.fillStyle = hsl(175, sat, brightness, nodeAlpha);
        if (mouseInfluence > 0.1) {
          ctx.shadowColor = hsl(175, 80, 50, 0.5);
          ctx.shadowBlur = mouseInfluence * 10;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + mouseInfluence * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Run detection
      detectPatterns(timestamp);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [initNodes, detectPatterns]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: "hsl(220, 20%, 4%)" }}
    />
  );
}
