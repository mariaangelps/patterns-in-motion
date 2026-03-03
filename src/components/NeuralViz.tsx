import { useRef, useEffect, useState, useCallback } from "react";
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
}

interface Connection {
  from: number;
  to: number;
  weight: number; // 0-1
  active: boolean;
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
    ? [0.9, 0.85, result.type === "CIRCLE" || result.type === "OVAL" ? 0.95 : 0.3,
       result.vertices >= 3 ? 0.8 : 0.2, 0.7, result.type === "STAR" ? 0.3 : 0.85]
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
    CIRCLE: 0, OVAL: 0,
    TRIANGLE: 1, "EQUILATERAL TRIANGLE": 1, "ISOSCELES TRIANGLE": 1, "RIGHT TRIANGLE": 1,
    SQUARE: 2, RECTANGLE: 2, DIAMOND: 2, QUADRILATERAL: 2,
    PENTAGON: 3,
    HEXAGON: 4, HEPTAGON: 4, OCTAGON: 4,
    STAR: 5,
    LINE: 6,
  };

  const classAct = CLASS_NODES.map((_, i) => {
    if (!hasResult) return hasInput ? 0.1 + Math.random() * 0.15 : 0;
    const winIdx = typeMap[result.type] ?? -1;
    if (i === winIdx) return (result.confidence / 100);
    return 0.05 + Math.random() * 0.15;
  });

  // Output
  const outputAct = hasResult ? [result.confidence / 100] : hasInput ? [0.1] : [0];

  return { inputAct, featureAct, patternAct, classAct, outputAct };
}

export default function NeuralViz({ inputPoints, result, isProcessing }: NeuralVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const timeRef = useRef(0);
  const [dimensions, setDimensions] = useState({ w: 400, h: 500 });
  const containerRef = useRef<HTMLDivElement>(null);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const { inputAct, featureAct, patternAct, classAct, outputAct } =
      getActivationsFromResult(result, inputPoints);

    const allLabels = [
      ...INPUT_NODES,
      ...FEATURE_NODES,
      ...PATTERN_NODES,
      ...CLASS_NODES,
      [result?.type ?? "?"],
    ].flat();

    const allActivations = [
      ...inputAct,
      ...featureAct,
      ...patternAct,
      ...classAct,
      ...outputAct,
    ];

    const layerSizes = [
      INPUT_NODES.length,
      FEATURE_NODES.length,
      PATTERN_NODES.length,
      CLASS_NODES.length,
      1,
    ];

    const draw = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;
      const w = dimensions.w;
      const h = dimensions.h;
      canvas.width = w * 2;
      canvas.height = h * 2;
      ctx.scale(2, 2);

      // Background
      ctx.fillStyle = "hsla(220, 20%, 3%, 0.95)";
      ctx.fillRect(0, 0, w, h);

      // Build nodes
      const nodes: Node[] = [];
      const paddingX = 50;
      const paddingY = 40;
      const layerSpacing = (w - paddingX * 2) / (layerSizes.length - 1);
      let nodeIdx = 0;

      for (let l = 0; l < layerSizes.length; l++) {
        const count = layerSizes[l];
        const layerH = h - paddingY * 2;
        const spacing = layerH / (count + 1);

        for (let n = 0; n < count; n++) {
          const x = paddingX + l * layerSpacing;
          const y = paddingY + (n + 1) * spacing;
          const act = allActivations[nodeIdx];

          // Color based on layer
          const hues = [175, 200, 280, 35, 120];
          const hue = hues[l];

          nodes.push({
            x,
            y,
            label: allLabels[nodeIdx],
            value: act,
            layer: l,
            color: `hsla(${hue}, 80%, 55%, 1)`,
          });
          nodeIdx++;
        }
      }

      // Build connections
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
            const weight = fromNode.value * toNode.value;
            connections.push({
              from: fromStart + f,
              to: toStart + ti,
              weight,
              active: weight > 0.15,
            });
          }
        }
        fromStart += fromCount;
      }

      // Draw connections
      for (const conn of connections) {
        const from = nodes[conn.from];
        const to = nodes[conn.to];
        const alpha = conn.active ? 0.08 + conn.weight * 0.4 : 0.03;

        ctx.strokeStyle = conn.active
          ? `hsla(175, 60%, 50%, ${alpha})`
          : `hsla(220, 10%, 30%, ${alpha})`;
        ctx.lineWidth = conn.active ? 1 + conn.weight * 1.5 : 0.5;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        // Bezier curve
        const midX = (from.x + to.x) / 2;
        ctx.bezierCurveTo(midX, from.y, midX, to.y, to.x, to.y);
        ctx.stroke();

        // Pulse along active connections
        if (conn.active && conn.weight > 0.3) {
          const pulse = ((t * 0.5 + conn.from * 0.1) % 1);
          const px = from.x + (to.x - from.x) * pulse;
          const py = from.y + (to.y - from.y) * pulse;

          ctx.fillStyle = `hsla(175, 80%, 60%, ${conn.weight * 0.6})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = Math.sin(t * 2 + node.x * 0.01) * 0.15;
        const r = 4 + node.value * 6;
        const alpha = 0.15 + node.value * 0.85;

        // Glow
        if (node.value > 0.3) {
          ctx.shadowColor = node.color.replace(/1\)$/, `${node.value * 0.6})`);
          ctx.shadowBlur = 8 + node.value * 12;
        }

        // Node circle
        ctx.fillStyle = node.color.replace(/1\)$/, `${alpha + pulse})`);
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.strokeStyle = node.color.replace(/1\)$/, `${alpha * 0.4})`);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Label
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = `hsla(180, 10%, 70%, ${0.3 + node.value * 0.5})`;
        ctx.fillText(node.label, node.x, node.y + r + 14);

        // Activation value
        if (node.value > 0.05) {
          ctx.font = "7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `hsla(175, 60%, 50%, ${0.4 + node.value * 0.4})`;
          ctx.fillText(`${(node.value * 100).toFixed(0)}%`, node.x, node.y - r - 6);
        }
      }

      // Layer labels
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      for (let l = 0; l < LAYER_LABELS.length; l++) {
        const x = paddingX + l * layerSpacing;
        ctx.fillStyle = "hsla(180, 10%, 50%, 0.5)";
        ctx.fillText(LAYER_LABELS[l], x, 16);
      }

      // Processing indicator
      if (isProcessing) {
        ctx.fillStyle = `hsla(175, 80%, 50%, ${0.3 + Math.sin(t * 6) * 0.2})`;
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("▸ PROCESSING...", w / 2, h - 12);
      }

      // Result output
      if (result) {
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
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ imageRendering: "auto" }}
      />
      {/* Scanline */}
      <div className="absolute inset-0 scanline opacity-5 pointer-events-none" />
    </div>
  );
}
