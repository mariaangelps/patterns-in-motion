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
  value: number; // 0-1 activation
  layer: number;
  color: string;
  reveal: number; // 0-1 (step-by-step reveal)
}

interface Connection {
  from: number;
  to: number;
  weight: number; // 0-1
  active: boolean;
  fromLayer: number;
  toLayer: number;
}

const LAYER_LABELS = [
  "INPUT",
  "FEATURE EXTRACTION",
  "PATTERN MATCHING",
  "CLASSIFICATION",
  "OUTPUT",
];

const INPUT_NODES = ["Points", "Distances", "Closure", "Density"];
const FEATURE_NODES = ["Perimeter", "Area", "Circularity", "Angles", "Symmetry", "Convexity"];
const PATTERN_NODES = ["RDP Simplify", "Hull Ratio", "Angle Variance", "Side Ratio", "Regularity"];
const CLASS_NODES = ["Circle", "Triangle", "Square", "Pentagon", "Hexagon", "Star", "Line"];

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t: number) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getActivationsFromResult(result: RecognizedShape | null, inputPoints: Point[]) {
  const hasInput = inputPoints.length > 0;
  const hasResult = !!result;

  // Input layer activations
  const inputAct = [
    hasInput ? Math.min(1, inputPoints.length / 50) : 0,
    hasInput ? 0.8 : 0,
    hasInput ? (inputPoints.length > 10 ? 0.9 : 0.3) : 0,
    hasInput ? Math.min(1, inputPoints.length / 30) : 0,
  ];

  // Feature activations (simulated based on result)
  const featureAct = hasResult
    ? [
        0.9,
        0.85,
        result.type === "CIRCLE" || result.type === "OVAL" ? 0.95 : 0.3,
        result.vertices >= 3 ? 0.8 : 0.2,
        0.7,
        result.type === "STAR" ? 0.3 : 0.85,
      ]
    : hasInput
    ? [0.4, 0.3, 0.2, 0.3, 0.2, 0.3]
    : [0, 0, 0, 0, 0, 0];

  // Pattern activations
  const patternAct = hasResult
    ? [0.9, result.type === "STAR" ? 0.9 : 0.4, 0.75, 0.8, 0.85]
    : hasInput
    ? [0.3, 0.2, 0.2, 0.2, 0.2]
    : [0, 0, 0, 0, 0];

  // Classification activations - highlight the winner
  const typeMap: Record<string, number> = {
    CIRCLE: 0,
    OVAL: 0,
    TRIANGLE: 1,
    "EQUILATERAL TRIANGLE": 1,
    "ISOSCELES TRIANGLE": 1,
    "RIGHT TRIANGLE": 1,
    SQUARE: 2,
    RECTANGLE: 2,
    DIAMOND: 2,
    QUADRILATERAL: 2,
    PENTAGON: 3,
    HEXAGON: 4,
    HEPTAGON: 4,
    OCTAGON: 4,
    STAR: 5,
    LINE: 6,
  };

  const classAct = CLASS_NODES.map((_, i) => {
    if (!hasResult) return hasInput ? 0.1 + Math.random() * 0.15 : 0;
    const winIdx = typeMap[result.type] ?? -1;
    if (i === winIdx) return result.confidence / 100;
    return 0.05 + Math.random() * 0.15;
  });

  // Output
  const outputAct = hasResult ? [result.confidence / 100] : hasInput ? [0.1] : [0];

  return { inputAct, featureAct, patternAct, classAct, outputAct };
}

export default function NeuralViz({ inputPoints, result, isProcessing }: NeuralVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ w: 400, h: 500 });

  // Step-by-step timeline (seconds per phase)
  // 0: input, 1: features, 2: pattern, 3: class, 4: output
  const phaseDurations = [0.55, 0.65, 0.65, 0.75, 0.55];
  const totalDuration = phaseDurations.reduce((a, b) => a + b, 0);

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

  // Reset the animation “sequence” when a new run starts
  useEffect(() => {
    timeRef.current = 0;
  }, [result, isProcessing, inputPoints.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { inputAct, featureAct, patternAct, classAct, outputAct } =
      getActivationsFromResult(result, inputPoints);

    const layerSizes = [
      INPUT_NODES.length,
      FEATURE_NODES.length,
      PATTERN_NODES.length,
      CLASS_NODES.length,
      1,
    ];

    const layerLabelsForNodes: string[][] = [
      INPUT_NODES,
      FEATURE_NODES,
      PATTERN_NODES,
      CLASS_NODES,
      [result?.type ?? "?"], // output label
    ];

    const allActivations = [
      ...inputAct,
      ...featureAct,
      ...patternAct,
      ...classAct,
      ...outputAct,
    ];

    function phaseFromTime(t: number) {
      // Loop when processing, otherwise “settle” at end
      const tt = isProcessing ? (t % totalDuration) : Math.min(t, totalDuration);

      let acc = 0;
      for (let p = 0; p < phaseDurations.length; p++) {
        const start = acc;
        const end = acc + phaseDurations[p];
        if (tt >= start && tt < end) {
          const local = (tt - start) / (end - start);
          return { phase: p, localT: local, globalT: tt / totalDuration };
        }
        acc = end;
      }
      return { phase: phaseDurations.length - 1, localT: 1, globalT: 1 };
    }

    const draw = () => {
      // time
      timeRef.current += 0.016;
      const t = timeRef.current;

      const { w, h } = dimensions;

      // high DPI
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      // IMPORTANT: reset transform each frame (avoid cumulative scale)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // background
      ctx.fillStyle = "hsla(220, 20%, 3%, 0.95)";
      ctx.fillRect(0, 0, w, h);

      // Phase logic (step-by-step)
      const { phase, localT } = phaseFromTime(t);
      // reveal for current phase should ease in
      const revealCurrent = easeInOutCubic(localT);

      // Layer reveal amount per layer (0..1)
      // layers < phase fully revealed, layer == phase easing in, >phase hidden
      const layerReveal = (layerIdx: number) => {
        if (layerIdx < phase) return 1;
        if (layerIdx === phase) return revealCurrent;
        return 0;
      };

      // layout
      const paddingX = 52;
      const paddingY = 44;
      const layerSpacing = (w - paddingX * 2) / (layerSizes.length - 1);

      // Build nodes with “fusion” animation (nodes appear clustered then spread)
      const nodes: Node[] = [];
      const nodeIndexToLayer: number[] = [];
      let globalIdx = 0;

      for (let l = 0; l < layerSizes.length; l++) {
        const count = layerSizes[l];
        const layerH = h - paddingY * 2;
        const spacing = layerH / (count + 1);

        const reveal = layerReveal(l);

        // where nodes “spawn” from: previous layer’s x (or slightly left for input)
        const xFinal = paddingX + l * layerSpacing;
        const xSpawn = paddingX + Math.max(0, l - 1) * layerSpacing;

        // also make them start near the center (fusion feel)
        const yCenter = paddingY + layerH / 2;

        for (let n = 0; n < count; n++) {
          const yFinal = paddingY + (n + 1) * spacing;
          const ySpawn = yCenter + (n - (count - 1) / 2) * 6; // tight cluster

          const x = xSpawn + (xFinal - xSpawn) * easeInOutCubic(reveal);
          const y = ySpawn + (yFinal - ySpawn) * easeInOutCubic(reveal);

          const actRaw = allActivations[globalIdx] ?? 0;
          // activation should “arrive” with reveal
          const act = actRaw * (0.15 + 0.85 * reveal);

          const hues = [175, 200, 280, 35, 120];
          const hue = hues[l];

          const label = layerLabelsForNodes[l][n] ?? "?";

          nodes.push({
            x,
            y,
            label,
            value: act,
            layer: l,
            color: `hsla(${hue}, 80%, 55%, 1)`,
            reveal,
          });

          nodeIndexToLayer.push(l);
          globalIdx++;
        }
      }

      // Build connections (only draw if both layers are revealed enough)
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

            const weight = clamp01(fromNode.value * toNode.value);
            connections.push({
              from: fromStart + f,
              to: toStart + ti,
              weight,
              active: weight > 0.15,
              fromLayer: l,
              toLayer: l + 1,
            });
          }
        }

        fromStart += fromCount;
      }

      // Optional: soft “layer bubble” that grows as each layer reveals (fusion vibe)
      for (let l = 0; l < layerSizes.length; l++) {
        const reveal = layerReveal(l);
        if (reveal <= 0) continue;

        const x = paddingX + l * layerSpacing;
        const radius = 22 + reveal * 36;

        ctx.beginPath();
        ctx.fillStyle = `hsla(210, 30%, 12%, ${0.04 + 0.06 * reveal})`;
        ctx.arc(x, h / 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Signal front (where the “electricity” is) to control pulses
      // 0..(layers-1)
      const layersCount = layerSizes.length;
      const signalPos = (phase + revealCurrent) * 1.0; // smooth from layer to layer

      // Draw connections
      for (const conn of connections) {
        const from = nodes[conn.from];
        const to = nodes[conn.to];

        // Visibility depends on reveal of both layers
        const vis = Math.min(layerReveal(conn.fromLayer), layerReveal(conn.toLayer));
        if (vis <= 0.001) continue;

        const baseAlpha = conn.active ? 0.06 + conn.weight * 0.35 : 0.02;
        const alpha = baseAlpha * (0.25 + 0.75 * vis);

        ctx.strokeStyle = conn.active
          ? `hsla(175, 60%, 50%, ${alpha})`
          : `hsla(220, 10%, 30%, ${alpha})`;
        ctx.lineWidth = (conn.active ? 1 + conn.weight * 1.4 : 0.6) * (0.6 + 0.4 * vis);

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        const midX = (from.x + to.x) / 2;
        ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
        ctx.stroke();

        // Traveling pulse ONLY near the signal front (step-by-step feel)
        const edgeIdx = conn.fromLayer + 0.5; // edge between layers
        const nearFront = Math.abs(signalPos - edgeIdx) < 0.55;

        if (conn.active && conn.weight > 0.25 && nearFront) {
          const pulseSpeed = 0.9 + conn.weight * 1.2;
          const pulse = ((t * pulseSpeed + conn.from * 0.07) % 1);

          const px = from.x + (to.x - from.x) * pulse;
          const py = from.y + (to.y - from.y) * pulse;

          ctx.fillStyle = `hsla(175, 80%, 60%, ${conn.weight * 0.7 * vis})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.2 + conn.weight * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const vis = node.reveal;
        if (vis <= 0.001) continue;

        // pulse a little, stronger near the signal
        const nearSignal = Math.abs(signalPos - node.layer) < 0.75 ? 1 : 0.35;
        const pulse = Math.sin(t * 2.4 + node.x * 0.01) * 0.14 * nearSignal;

        const r = 3.5 + node.value * 6.5;
        const alpha = (0.10 + node.value * 0.90) * (0.25 + 0.75 * vis);

        // Glow
        if (node.value > 0.28) {
          ctx.shadowColor = node.color.replace(/1\)$/, `${0.55 * node.value * vis})`);
          ctx.shadowBlur = 6 + node.value * 14;
        } else {
          ctx.shadowBlur = 0;
        }

        // Node body
        ctx.fillStyle = node.color.replace(/1\)$/, `${clamp01(alpha + pulse)} )`.replace(" )", ")"));
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = node.color.replace(/1\)$/, `${alpha * 0.35})`);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Labels
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `hsla(180, 10%, 70%, ${0.18 + node.value * 0.55 * vis})`;
        ctx.fillText(node.label, node.x, node.y + r + 14);

        // Activation %
        if (node.value > 0.05 && vis > 0.25) {
          ctx.font = "7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `hsla(175, 60%, 50%, ${0.25 + node.value * 0.55 * vis})`;
          ctx.fillText(`${(node.value * 100).toFixed(0)}%`, node.x, node.y - r - 6);
        }
      }

      // Layer labels (fade by reveal)
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      for (let l = 0; l < LAYER_LABELS.length; l++) {
        const x = paddingX + l * layerSpacing;
        const vis = layerReveal(l);
        ctx.fillStyle = `hsla(180, 10%, 50%, ${0.12 + 0.45 * vis})`;
        ctx.fillText(LAYER_LABELS[l], x, 16);
      }

      // Processing indicator
      if (isProcessing) {
        ctx.fillStyle = `hsla(175, 80%, 50%, ${0.25 + Math.sin(t * 6) * 0.2})`;
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("▸ PROCESSING...", w / 2, h - 12);
      }

      // Result output (settles at end)
      if (result && !isProcessing) {
        ctx.font = "bold 12px 'Space Grotesk', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = result.color.replace(/1\)$/, "0.9)");
        ctx.shadowColor = result.color;
        ctx.shadowBlur = 10;
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
      {/* Scanline */}
      <div className="absolute inset-0 scanline opacity-5 pointer-events-none" />
    </div>
  );
}