import { useRef, useEffect, useState, useCallback } from "react";
import { recognizeFromPoints, type Point, type RecognizedShape } from "@/lib/shapeRecognition";

type Mode = "draw" | "points";

interface Props {
  onShapeRecognized?: (shape: RecognizedShape) => void;
}

export default function DrawingCanvas({ onShapeRecognized }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [placedPoints, setPlacedPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<RecognizedShape | null>(null);
  const [history, setHistory] = useState<RecognizedShape[]>([]);
  const [showResult, setShowResult] = useState(false);
  const animRef = useRef<number>(0);
  const fadeRef = useRef(0);

  const clear = useCallback(() => {
    setCurrentPath([]);
    setPlacedPoints([]);
    setResult(null);
    setShowResult(false);
    fadeRef.current = 0;
  }, []);

  // Recognize shape
  const recognize = useCallback(
    (pts: Point[]) => {
      const shape = recognizeFromPoints(pts);
      if (shape) {
        setResult(shape);
        setShowResult(true);
        fadeRef.current = 0;
        setHistory((prev) => [shape, ...prev].slice(0, 20));
        onShapeRecognized?.(shape);
      } else {
        setResult(null);
        setShowResult(true);
        fadeRef.current = 0;
      }
    },
    [onShapeRecognized]
  );

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "hsl(220, 20%, 4%)";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "hsla(220, 15%, 15%, 0.3)";
      ctx.lineWidth = 0.5;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw current free-draw path
      if (currentPath.length > 1) {
        ctx.strokeStyle = "hsla(175, 80%, 50%, 0.6)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "hsla(175, 80%, 50%, 0.4)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
          ctx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw placed points and connections
      if (placedPoints.length > 0) {
        // Lines between points
        if (placedPoints.length > 1) {
          ctx.strokeStyle = "hsla(175, 80%, 50%, 0.5)";
          ctx.lineWidth = 2;
          ctx.shadowColor = "hsla(175, 80%, 50%, 0.3)";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(placedPoints[0].x, placedPoints[0].y);
          for (let i = 1; i < placedPoints.length; i++) {
            ctx.lineTo(placedPoints[i].x, placedPoints[i].y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Points
        for (let i = 0; i < placedPoints.length; i++) {
          const p = placedPoints[i];

          // Outer ring
          ctx.strokeStyle = "hsla(175, 80%, 50%, 0.4)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.stroke();

          // Inner dot
          ctx.fillStyle = "hsla(175, 80%, 50%, 0.9)";
          ctx.shadowColor = "hsla(175, 80%, 50%, 0.6)";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          // Label
          ctx.fillStyle = "hsla(175, 80%, 50%, 0.6)";
          ctx.font = "10px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(`P${i + 1}`, p.x, p.y - 18);
        }
      }

      // Draw recognized shape overlay
      if (result && showResult) {
        fadeRef.current = Math.min(1, fadeRef.current + 0.03);
        const alpha = fadeRef.current;

        if (result.type === "CÍRCULO" && result.points.length === 1) {
          const c = result.points[0];
          const r = parseInt(result.description.match(/\d+/)?.[0] || "50");
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.8 * alpha})`);
          ctx.lineWidth = 3;
          ctx.shadowColor = result.color;
          ctx.shadowBlur = 15 * alpha;
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.08 * alpha})`);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (result.points.length >= 2) {
          const pts = result.points;
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.8 * alpha})`);
          ctx.lineWidth = 3;
          ctx.shadowColor = result.color;
          ctx.shadowBlur = 15 * alpha;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          if (pts.length >= 3) ctx.closePath();
          ctx.stroke();

          if (pts.length >= 3) {
            ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.06 * alpha})`);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.shadowBlur = 0;

          // Vertex highlights
          for (const p of pts) {
            ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.9 * alpha})`);
            ctx.shadowColor = result.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        // Result label
        if (alpha > 0.3) {
          const labelAlpha = Math.min(1, (alpha - 0.3) * 3);
          const cx = result.points.length > 0
            ? result.points.reduce((s, p) => s + p.x, 0) / result.points.length
            : w / 2;
          const cy = (result.points.length > 0
            ? result.points.reduce((s, p) => s + p.y, 0) / result.points.length
            : h / 2) - 40;

          ctx.font = "bold 16px 'Space Grotesk', sans-serif";
          ctx.textAlign = "center";
          const text = result.type;
          const metrics = ctx.measureText(text);

          // Background
          ctx.fillStyle = `hsla(220, 20%, 4%, ${0.85 * labelAlpha})`;
          const pad = 16;
          ctx.fillRect(cx - metrics.width / 2 - pad, cy - 14, metrics.width + pad * 2, 50);

          // Border
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.5 * labelAlpha})`);
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - metrics.width / 2 - pad, cy - 14, metrics.width + pad * 2, 50);

          // Shape name
          ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${labelAlpha})`);
          ctx.fillText(text, cx, cy + 6);

          // Confidence
          ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.fillStyle = `hsla(180, 10%, 75%, ${labelAlpha * 0.7})`;
          ctx.fillText(`${result.confidence}% confidence · ${result.description}`, cx, cy + 28);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [currentPath, placedPoints, result, showResult]);

  // Mouse handlers
  const getPos = (e: React.MouseEvent): Point => ({
    x: e.clientX,
    y: e.clientY,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode === "draw") {
      clear();
      setIsDrawing(true);
      setCurrentPath([getPos(e)]);
    } else {
      const p = getPos(e);
      setResult(null);
      setShowResult(false);
      setPlacedPoints((prev) => [...prev, p]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mode === "draw" && isDrawing) {
      setCurrentPath((prev) => [...prev, getPos(e)]);
    }
  };

  const handleMouseUp = () => {
    if (mode === "draw" && isDrawing) {
      setIsDrawing(false);
      if (currentPath.length > 5) {
        recognize(currentPath);
      }
    }
  };

  const finishPoints = () => {
    if (placedPoints.length >= 2) {
      recognize(placedPoints);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-20 pointer-events-none">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Title */}
          <div className="font-mono text-xs">
            <div className="text-muted-foreground">SHAPE RECOGNITION v1.0</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-primary text-glow">
                {mode === "draw" ? "FREE DRAW" : "PLACE POINTS"}
              </span>
            </div>
          </div>

          {/* Mode switcher */}
          <div className="pointer-events-auto flex gap-1 bg-card/80 rounded-md p-1 border border-border/50 border-glow backdrop-blur-sm">
            <button
              onClick={() => { setMode("draw"); clear(); }}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                mode === "draw"
                  ? "bg-primary/20 text-primary border-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ✏️ Draw
            </button>
            <button
              onClick={() => { setMode("points"); clear(); }}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                mode === "points"
                  ? "bg-primary/20 text-primary border-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📍 Points
            </button>
          </div>

          {/* Counter */}
          <div className="font-mono text-xs text-right">
            <div className="text-muted-foreground">RECOGNIZED</div>
            <div className="text-2xl font-display font-bold text-primary text-glow mt-1">
              {history.length.toString().padStart(3, "0")}
            </div>
          </div>
        </div>
      </div>

      {/* Points mode: finish button */}
      {mode === "points" && placedPoints.length >= 2 && !showResult && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={finishPoints}
            className="px-6 py-3 bg-primary/20 text-primary border border-primary/30 rounded-md font-mono text-sm hover:bg-primary/30 transition-all border-glow backdrop-blur-sm"
          >
            ▸ ▸ RECOGNIZE SHAPE ({placedPoints.length} points)
          </button>
        </div>
      )}

      {/* Clear button */}
      {(currentPath.length > 0 || placedPoints.length > 0) && (
        <div className="fixed bottom-24 right-6 z-20">
          <button
            onClick={clear}
            className="px-4 py-2 bg-card/80 text-muted-foreground border border-border/50 rounded-md font-mono text-xs hover:text-foreground transition-all backdrop-blur-sm"
          >
            CLEAR
          </button>
        </div>
      )}

      {/* No match */}
      {showResult && !result && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="px-6 py-4 bg-card/80 border border-destructive/30 rounded-md font-mono text-sm text-center backdrop-blur-sm">
            <div className="text-destructive">✗ ✗ NOT RECOGNIZED</div>
            <div className="text-muted-foreground text-xs mt-1">Try drawing a clearer shape</div>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="fixed bottom-6 left-6 z-20 font-mono text-xs max-w-xs pointer-events-none">
          <div className="text-muted-foreground mb-2">HISTORY</div>
          <div className="space-y-0.5">
            {history.slice(0, 8).map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2"
                style={{ opacity: 0.3 + ((8 - i) / 8) * 0.7 }}
              >
                <span style={{ color: s.color }}>●</span>
                <span className="text-secondary-foreground">{s.type}</span>
                <span className="text-muted-foreground">{s.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none font-mono text-xs text-muted-foreground/30">
        {mode === "draw"
          ? "draw a shape with your mouse"
          : "click to place vertices, then press recognize"}
      </div>

      {/* Scanline overlay */}
      <div className="fixed inset-0 scanline opacity-10 pointer-events-none z-10" />
    </div>
  );
}
