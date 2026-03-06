import { useRef, useEffect, useState } from "react";
import type { RecognizedShape, Point } from "@/lib/shapeRecognition";

interface NeuralVizProps {
  inputPoints: Point[];
  result: RecognizedShape | null;
  isProcessing: boolean;
}

interface Node {
  x: number;
  y: number;
  label: string;
  baseValue: number;
  value: number;
  layer: number;
  color: string;
  appear: number;
}

interface Connection {
  from: number;
  to: number;
  weight: number;
  active: boolean;
  fromLayer: number;
  toLayer: number;
}

const LAYER_LABELS = ["INPUT", "FEATURES", "PATTERN", "CLASSIFY", "OUTPUT"];

const INPUT_NODES = ["Points", "Distances", "Closure", "Density"];
const FEATURE_NODES = ["Perimeter", "Area", "Circularity", "Angles", "Symmetry", "Convexity"];
const PATTERN_NODES = ["RDP Simplify", "Hull Ratio", "Angle Variance", "Side Ratio", "Regularity"];
const CLASS_NODES = ["Circle", "Triangle", "Square", "Pentagon", "Hexagon", "Star", "Line"];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOut(t: number) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function pseudoRand(seed: number) {
  const x = Math.sin(seed * 999.123) * 10000;
  return x - Math.floor(x);
}

function getActivationsFromResult(result: RecognizedShape | null, inputPoints: Point[]) {
  const hasInput = inputPoints.length > 0;
  const hasResult = !!result;

  const inputAct = [
    hasInput ? Math.min(1, inputPoints.length / 50) : 0,
    hasInput ? 0.8 : 0,
    hasInput ? (inputPoints.length > 10 ? 0.9 : 0.3) : 0,
    hasInput ? Math.min(1, inputPoints.length / 30) : 0,
  ];

  const featureAct = hasResult
    ? [
        0.9, 0.85,
        result.type === "CIRCLE" || result.type === "OVAL" ? 0.95 : 0.3,
        result.vertices >= 3 ? 0.8 : 0.2, 0.7,
        result.type === "STAR" ? 0.3 : 0.85,
      ]
    : hasInput ? [0.4, 0.3, 0.2, 0.3, 0.2, 0.3] : [0, 0, 0, 0, 0, 0];

  const patternAct = hasResult
    ? [0.9, result.type === "STAR" ? 0.9 : 0.4, 0.75, 0.8, 0.85]
    : hasInput ? [0.3, 0.2, 0.2, 0.2, 0.2] : [0, 0, 0, 0, 0];

  const typeMap: Record<string, number> = {
    CIRCLE: 0, OVAL: 0,
    TRIANGLE: 1, "EQUILATERAL TRIANGLE": 1, "ISOSCELES TRIANGLE": 1, "RIGHT TRIANGLE": 1,
    SQUARE: 2, RECTANGLE: 2, DIAMOND: 2, QUADRILATERAL: 2,
    PENTAGON: 3, HEXAGON: 4, HEPTAGON: 4, OCTAGON: 4, STAR: 5, LINE: 6,
  };

  const classAct = CLASS_NODES.map((_, i) => {
    if (!hasResult) return hasInput ? 0.12 + pseudoRand(i * 7.3) * 0.12 : 0;
    const winIdx = typeMap[result.type] ?? -1;
    if (i === winIdx) return result.confidence / 100;
    return 0.05 + pseudoRand(i * 7.3) * 0.12;
  });

  const outputAct = hasResult ? [result.confidence / 100] : hasInput ? [0.15] : [0];

  return { inputAct, featureAct, patternAct, classAct, outputAct };
}

export default function NeuralViz({ inputPoints, result, isProcessing }: NeuralVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const animRef = useRef<number>(0);
  const tRef = useRef<number>(0);

  const seqStartRef = useRef<number>(0);
  const lastKeyRef = useRef<string>("");

  const [dimensions, setDimensions] = useState({ w: 400, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const key = `${inputPoints.length > 0 ? "H" : "N"}|${isProcessing ? "P" : "S"}|${
      result ? `${result.type}:${result.confidence}` : "none"
    }`;
    if (key !== lastKeyRef.current) {
      lastKeyRef.current = key;
      if (inputPoints.length > 0) {
        seqStartRef.current = tRef.current;
      }
    }
  }, [inputPoints.length, isProcessing, result?.type, result?.confidence]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layerSizes = [INPUT_NODES.length, FEATURE_NODES.length, PATTERN_NODES.length, CLASS_NODES.length, 1];
    const layerNodeLabels: string[][] = [INPUT_NODES, FEATURE_NODES, PATTERN_NODES, CLASS_NODES, [result?.type ?? "?"]];
    const hues = [175, 200, 280, 35, 120];

    function winnerIndexForResult(res: RecognizedShape | null): number {
      if (!res) return -1;
      const typeMap: Record<string, number> = {
        CIRCLE: 0, OVAL: 0,
        TRIANGLE: 1, "EQUILATERAL TRIANGLE": 1, "ISOSCELES TRIANGLE": 1, "RIGHT TRIANGLE": 1,
        SQUARE: 2, RECTANGLE: 2, DIAMOND: 2, QUADRILATERAL: 2,
        PENTAGON: 3, HEXAGON: 4, HEPTAGON: 4, OCTAGON: 4, STAR: 5, LINE: 6,
      };
      return typeMap[res.type] ?? -1;
    }

    const BUILD_NODES = 0.95;
    const WEAVE_WIRES = 1.05;
    const FLOW_PASS = 1.35;
    const COMMIT = 0.75;
    const TOTAL = BUILD_NODES + WEAVE_WIRES + FLOW_PASS + COMMIT;
    const PULSE_COUNT = 10;

    const draw = () => {
      tRef.current += 0.016;
      const t = tRef.current;
      const { w, h } = dimensions;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = "hsla(220, 20%, 3%, 0.95)";
      ctx.fillRect(0, 0, w, h);

      const { inputAct, featureAct, patternAct, classAct, outputAct } =
        getActivationsFromResult(result, inputPoints);
      const allActs = [...inputAct, ...featureAct, ...patternAct, ...classAct, ...outputAct];

      layerNodeLabels[4] = [result?.type ?? "?"];

      const seqT = (() => {
        const raw = t - seqStartRef.current;
        if (inputPoints.length === 0) return 0;
        if (isProcessing && !result) {
          const pre = BUILD_NODES + WEAVE_WIRES;
          const loopLen = FLOW_PASS;
          const into = Math.max(0, raw - pre);
          return Math.min(pre, raw) + (into % loopLen);
        }
        return Math.min(raw, TOTAL);
      })();

      const pBuild = clamp01(seqT / BUILD_NODES);
      const pWires = clamp01((seqT - BUILD_NODES) / WEAVE_WIRES);
      const pFlow = clamp01((seqT - BUILD_NODES - WEAVE_WIRES) / FLOW_PASS);
      const pCommit = clamp01((seqT - BUILD_NODES - WEAVE_WIRES - FLOW_PASS) / COMMIT);

      // Whether the network has finished animating — no more flicker
      const settled = !!(result && seqT >= TOTAL);

      const paddingX = 52;
      const paddingY = 44;
      const layerSpacing = (w - paddingX * 2) / (layerSizes.length - 1);

      const nodes: Node[] = [];
      let idx = 0;

      for (let l = 0; l < layerSizes.length; l++) {
        const count = layerSizes[l];
        const layerH = h - paddingY * 2;
        const spacing = layerH / (count + 1);

        for (let n = 0; n < count; n++) {
          const x = paddingX + l * layerSpacing;
          const y = paddingY + (n + 1) * spacing;
          const baseValue = clamp01(allActs[idx] ?? 0);

          nodes.push({
            x, y,
            label: layerNodeLabels[l][n] ?? "?",
            baseValue, value: 0, layer: l,
            color: `hsla(${hues[l]}, 80%, 55%, 1)`,
            appear: 0,
          });
          idx++;
        }
      }

      const N = nodes.length;
      const appearCount = Math.floor(easeOutCubic(pBuild) * N);

      for (let i = 0; i < nodes.length; i++) {
        const appear = i < appearCount ? 1 : 0;
        const nextEdge = easeOutCubic(pBuild) * N;
        if (i === Math.floor(nextEdge)) {
          const frac = nextEdge - Math.floor(nextEdge);
          nodes[i].appear = easeInOut(frac);
        } else {
          nodes[i].appear = appear;
        }

        const flicker = settled ? 0 : (0.06 + 0.06 * Math.sin(t * 8 + i * 0.7));
        nodes[i].value = nodes[i].appear * flicker;
      }

      // Connections
      const connections: Connection[] = [];
      let fromStart = 0;

      for (let l = 0; l < layerSizes.length - 1; l++) {
        const fromCount = layerSizes[l];
        const toStart = fromStart + fromCount;
        const toCount = layerSizes[l + 1];

        for (let f = 0; f < fromCount; f++) {
          for (let ti = 0; ti < toCount; ti++) {
            const fromNode = nodes[fromStart + f];
            const toNode = nodes[toStart + ti];
            const weight = clamp01(fromNode.baseValue * toNode.baseValue);
            connections.push({
              from: fromStart + f, to: toStart + ti,
              weight, active: weight > 0.15,
              fromLayer: l, toLayer: l + 1,
            });
          }
        }
        fromStart += fromCount;
      }

      const wireOrder = connections
        .map((c, i) => ({ i, k: pseudoRand(i * 13.37 + c.from * 0.11 + c.to * 0.17) }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.i);

      const visibleWiresCount = Math.floor(easeInOut(pWires) * connections.length);

      function drawBezierPartial(
        x0: number, y0: number, x1: number, y1: number,
        x2: number, y2: number, x3: number, y3: number, u: number
      ) {
        const steps = 18;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const tt = (u * s) / steps;
          const xa = lerp(x0, x1, tt); const ya = lerp(y0, y1, tt);
          const xb = lerp(x1, x2, tt); const yb = lerp(y1, y2, tt);
          const xc = lerp(x2, x3, tt); const yc = lerp(y2, y3, tt);
          const xm = lerp(xa, xb, tt); const ym = lerp(ya, yb, tt);
          const xn = lerp(xb, xc, tt); const yn = lerp(yb, yc, tt);
          const x = lerp(xm, xn, tt); const y = lerp(ym, yn, tt);
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      const inputLen = INPUT_NODES.length;
      const featureLen = FEATURE_NODES.length;
      const patternLen = PATTERN_NODES.length;
      const classStart = inputLen + featureLen + patternLen;
      const winnerLocal = winnerIndexForResult(result);
      const winnerGlobal = winnerLocal >= 0 ? classStart + winnerLocal : -1;

      // Draw connections
      for (let rank = 0; rank < wireOrder.length; rank++) {
        const ci = wireOrder[rank];
        const conn = connections[ci];

        const from = nodes[conn.from];
        const to = nodes[conn.to];
        const endpointsReady = from.appear > 0.2 && to.appear > 0.2;
        if (!endpointsReady) continue;

        let wireReveal = 0;
        if (rank < visibleWiresCount) wireReveal = 1;
        else {
          const edge = easeInOut(pWires) * connections.length;
          if (rank === Math.floor(edge)) {
            wireReveal = easeInOut(edge - Math.floor(edge));
          }
        }
        if (wireReveal <= 0.001) continue;

        const baseAlpha = conn.active ? 0.08 + conn.weight * 0.25 : 0.03;

        let commitBoost = 0;
        if (result && winnerGlobal >= 0 && pCommit > 0) {
          const endsAtWinner = conn.to === winnerGlobal;
          const leadsToClass = conn.toLayer === 3;
          commitBoost = (endsAtWinner ? 0.65 : leadsToClass ? 0.25 : 0.0) * easeInOut(pCommit);
        }

        const alpha = clamp01(baseAlpha + commitBoost * 0.35) * wireReveal;
        const width = (conn.active ? 0.7 + conn.weight * 1.2 : 0.5) * (0.8 + commitBoost * 0.8);

        ctx.strokeStyle = conn.active
          ? `hsla(175, 60%, 50%, ${alpha})`
          : `hsla(220, 10%, 30%, ${alpha})`;
        ctx.lineWidth = width;

        const midX = (from.x + to.x) / 2;
        const grow = easeOutCubic(wireReveal);
        drawBezierPartial(from.x, from.y, midX, from.y, midX, to.y, to.x, to.y, grow);
      }

      // Signal front
      const signalFront = easeInOut(pFlow) * (layerSizes.length - 1);

      // Animate node activations
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.appear <= 0.001) continue;

        const dist = Math.abs(node.layer - signalFront);
        const wave = clamp01(1 - dist / 1.2);
        const waveEase = easeOutCubic(wave);
        const target = node.baseValue;

        const pre = Math.min(1, pBuild * 0.7 + pWires * 0.3);
        const flicker = settled ? 0 : (0.06 + 0.05 * Math.sin(t * 8 + i)) * (1 - clamp01(pFlow));
        const charge = waveEase * (0.15 + 0.85 * easeInOut(pFlow));

        let winBoost = 0;
        if (result && winnerGlobal >= 0 && pCommit > 0) {
          const isWinner = i === winnerGlobal;
          const isOutput = node.layer === 4;
          const isClass = node.layer === 3;
          winBoost = (isWinner ? 0.8 : isOutput ? 0.55 : isClass ? 0.18 : 0) * easeInOut(pCommit);
        }

        node.value = node.appear * clamp01(flicker + pre * 0.02 + charge * target + winBoost * target);

        // Once settled, lock to final stable values — no flicker
        if (settled) {
          node.value = node.appear * target;
          if (winnerGlobal >= 0 && i !== winnerGlobal && node.layer === 3) {
            node.value *= 0.65;
          }
        }
      }

      // Pulses — only while animating, stop once settled
      if (pFlow > 0.02 && !settled) {
        const pulses = PULSE_COUNT;
        for (let k = 0; k < pulses; k++) {
          const phase = (t * (0.55 + 0.08 * k) + k * 0.37) % 1;
          const front = signalFront * 0.92;
          const edgeF = clamp01((front / (layerSizes.length - 1)) + (phase - 0.5) * 0.18);
          const edge = edgeF * (layerSizes.length - 2);
          const edgeIdx = Math.floor(edge);
          const local = edge - edgeIdx;

          const candidates = connections.filter(
            (c) => c.fromLayer === edgeIdx && c.active && nodes[c.from].appear > 0.6 && nodes[c.to].appear > 0.6
          );
          if (candidates.length === 0) continue;

          const pick = candidates[Math.floor(pseudoRand(k * 31.7 + edgeIdx * 91.1) * candidates.length)];
          const fromN = nodes[pick.from];
          const toN = nodes[pick.to];

          const px = lerp(fromN.x, toN.x, local);
          const py = lerp(fromN.y, toN.y, local);

          const alpha = (0.15 + pick.weight * 0.55) * easeInOut(pFlow);
          ctx.fillStyle = `hsla(175, 80%, 60%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.2 + pick.weight * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.appear <= 0.001) continue;

        const pulse = settled ? 0 : Math.sin(t * 2.2 + node.x * 0.01) * 0.12;
        const r = 3.2 + node.value * 7.2;
        const alpha = clamp01((0.08 + node.value * 0.92) * node.appear);

        if (node.value > 0.25) {
          ctx.shadowColor = node.color.replace(/1\)$/, `${0.55 * node.value})`);
          ctx.shadowBlur = 8 + node.value * 12;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = node.color.replace(/1\)$/, `${clamp01(alpha + pulse)})`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = node.color.replace(/1\)$/, `${alpha * 0.35})`);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `hsla(180, 10%, 70%, ${0.15 + node.appear * 0.55})`;
        ctx.fillText(node.label, node.x, node.y + r + 14);

        if (pFlow > 0.15 && node.value > 0.06) {
          ctx.font = "7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `hsla(175, 60%, 50%, ${0.25 + node.value * 0.55})`;
          ctx.fillText(`${(node.value * 100).toFixed(0)}%`, node.x, node.y - r - 6);
        }
      }

      // Layer labels
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      for (let l = 0; l < LAYER_LABELS.length; l++) {
        const x = paddingX + l * layerSpacing;
        const vis = clamp01((pBuild * 1.15) - l * 0.12);
        ctx.fillStyle = `hsla(180, 10%, 50%, ${0.10 + 0.45 * vis})`;
        ctx.fillText(LAYER_LABELS[l], x, 16);
      }

      // Footer status
      if (isProcessing && !result) {
        ctx.fillStyle = `hsla(175, 80%, 50%, ${0.22 + Math.sin(t * 6) * 0.18})`;
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("▸ FORMING NETWORK…", w / 2, h - 12);
      }

      if (result) {
        const arrive = easeOutCubic(clamp01((seqT - (BUILD_NODES + WEAVE_WIRES + 0.25)) / 0.55));
        ctx.font = "bold 12px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = result.color.replace(/1\)$/, `${0.35 + 0.55 * arrive})`);
        ctx.shadowColor = result.color;
        ctx.shadowBlur = 8 + 14 * arrive;
        ctx.fillText(`→ ${result.type} (${result.confidence}%)`, w / 2, h - 12);
        ctx.shadowBlur = 0;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [dimensions, inputPoints, result, isProcessing]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ imageRendering: "auto" }} />
    </div>
  );
}
