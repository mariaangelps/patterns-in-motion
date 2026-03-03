import { useRef, useEffect, useState, useCallback } from "react";
import { recognizeFromPoints, type Point, type RecognizedShape } from "@/lib/shapeRecognition";
import NeuralViz from "./NeuralViz";

type Mode = "draw" | "points";

interface Props {
  onShapeRecognized?: (shape: RecognizedShape) => void;
}

export default function DrawingCanvas({ onShapeRecognized }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("draw");
  const [showNeural, setShowNeural] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [placedPoints, setPlacedPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<RecognizedShape | null>(null);
  const [history, setHistory] = useState<RecognizedShape[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const animRef = useRef<number>(0);
  const fadeRef = useRef(0);

  const clear = useCallback(() => {
    setCurrentPath([]);
    setPlacedPoints([]);
    setResult(null);
    setShowResult(false);
    setIsProcessing(false);
    fadeRef.current = 0;
  }, []);

  const recognize = useCallback(
    (pts: Point[]) => {
      setIsProcessing(true);
      setTimeout(() => {
        const shape = recognizeFromPoints(pts);
        setIsProcessing(false);
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
      }, 400);
    },
    [onShapeRecognized]
  );

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const container = containerRef.current;

    const resize = () => {
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      resize();
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "hsl(220, 20%, 4%)";
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "hsla(220, 15%, 15%, 0.3)";
      ctx.lineWidth = 0.5;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // Free-draw path
      if (currentPath.length > 1) {
        ctx.strokeStyle = "hsla(175, 80%, 50%, 0.6)";
        ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = "hsla(175, 80%, 50%, 0.4)"; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) ctx.lineTo(currentPath[i].x, currentPath[i].y);
        ctx.stroke(); ctx.shadowBlur = 0;
      }

      // Placed points
      if (placedPoints.length > 0) {
        if (placedPoints.length > 1) {
          ctx.strokeStyle = "hsla(175, 80%, 50%, 0.5)"; ctx.lineWidth = 2;
          ctx.shadowColor = "hsla(175, 80%, 50%, 0.3)"; ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(placedPoints[0].x, placedPoints[0].y);
          for (let i = 1; i < placedPoints.length; i++) ctx.lineTo(placedPoints[i].x, placedPoints[i].y);
          ctx.stroke(); ctx.shadowBlur = 0;
        }
        for (let i = 0; i < placedPoints.length; i++) {
          const p = placedPoints[i];
          ctx.strokeStyle = "hsla(175, 80%, 50%, 0.4)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "hsla(175, 80%, 50%, 0.9)";
          ctx.shadowColor = "hsla(175, 80%, 50%, 0.6)"; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = "hsla(175, 80%, 50%, 0.6)";
          ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
          ctx.fillText(`P${i + 1}`, p.x, p.y - 18);
        }
      }

      // Recognized shape overlay
      if (result && showResult) {
        fadeRef.current = Math.min(1, fadeRef.current + 0.03);
        const alpha = fadeRef.current;

        if ((result.type === "CIRCLE" || result.type === "OVAL") && result.points.length === 1) {
          const c = result.points[0];
          const r = parseInt(result.description.match(/\d+/)?.[0] || "50");
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.8 * alpha})`);
          ctx.lineWidth = 3; ctx.shadowColor = result.color; ctx.shadowBlur = 15 * alpha;
          ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.08 * alpha})`); ctx.fill();
          ctx.shadowBlur = 0;
        } else if (result.points.length >= 2) {
          const pts = result.points;
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.8 * alpha})`);
          ctx.lineWidth = 3; ctx.shadowColor = result.color; ctx.shadowBlur = 15 * alpha;
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          if (pts.length >= 3) ctx.closePath();
          ctx.stroke();
          if (pts.length >= 3) {
            ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.06 * alpha})`);
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath(); ctx.fill();
          }
          ctx.shadowBlur = 0;
          for (const p of pts) {
            ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${0.9 * alpha})`);
            ctx.shadowColor = result.color; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          }
        }

        if (alpha > 0.3) {
          const labelAlpha = Math.min(1, (alpha - 0.3) * 3);
          const cx = result.points.length > 0
            ? result.points.reduce((s, p) => s + p.x, 0) / result.points.length : w / 2;
          const cy = (result.points.length > 0
            ? result.points.reduce((s, p) => s + p.y, 0) / result.points.length : h / 2) - 40;
          ctx.font = "bold 16px 'Space Grotesk', sans-serif"; ctx.textAlign = "center";
          const text = result.type;
          const metrics = ctx.measureText(text);
          ctx.fillStyle = `hsla(220, 20%, 4%, ${0.85 * labelAlpha})`;
          const pad = 16;
          ctx.fillRect(cx - metrics.width / 2 - pad, cy - 14, metrics.width + pad * 2, 50);
          ctx.strokeStyle = result.color.replace(/[\d.]+\)$/, `${0.5 * labelAlpha})`); ctx.lineWidth = 1;
          ctx.strokeRect(cx - metrics.width / 2 - pad, cy - 14, metrics.width + pad * 2, 50);
          ctx.fillStyle = result.color.replace(/[\d.]+\)$/, `${labelAlpha})`);
          ctx.fillText(text, cx, cy + 6);
          ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.fillStyle = `hsla(180, 10%, 75%, ${labelAlpha * 0.7})`;
          ctx.fillText(`${result.confidence}% confidence · ${result.description}`, cx, cy + 28);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, [currentPath, placedPoints, result, showResult]);

  // Mouse handlers — use offset relative to canvas container
  const getPos = (e: React.MouseEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: e.clientX, y: e.clientY };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

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
      if (currentPath.length > 5) recognize(currentPath);
    }
  };

  const finishPoints = () => {
    if (placedPoints.length >= 2) recognize(placedPoints);
  };

  const activePoints = mode === "draw" ? currentPath : placedPoints;

  return (
    <div className="relative w-full h-screen overflow-hidden flex flex-col">
      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-6 py-3 bg-card/60 backdrop-blur-sm border-b border-border/30">
        {/* Title */}
        <div className="font-mono text-xs">
          <div className="text-muted-foreground">SHAPE RECOGNITION v1.0</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-primary text-glow text-[10px]">
              {mode === "draw" ? "FREE DRAW" : "PLACE POINTS"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-1 bg-card/80 rounded-md p-1 border border-border/50 border-glow backdrop-blur-sm">
          <button
            onClick={() => { setMode("draw"); clear(); }}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
              mode === "draw" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ✏️ Draw
          </button>
          <button
            onClick={() => { setMode("points"); clear(); }}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
              mode === "points" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📍 Points
          </button>
          <div className="w-px bg-border/30 mx-1" />
          <button
            onClick={() => setShowNeural((v) => !v)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
              showNeural ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🧠 Neural
          </button>
        </div>

        {/* Counter */}
        <div className="font-mono text-xs text-right">
          <div className="text-muted-foreground">RECOGNIZED</div>
          <div className="text-2xl font-display font-bold text-primary text-glow">
            {history.length.toString().padStart(3, "0")}
          </div>
        </div>
      </div>

      {/* Main content: canvas + neural side by side */}
      <div className="flex-1 flex min-h-0">
        {/* Canvas panel */}
        <div
          ref={containerRef}
          className={`relative ${showNeural ? "w-1/2" : "w-full"} h-full transition-all duration-300`}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Points mode: finish button */}
          {mode === "points" && placedPoints.length >= 2 && !showResult && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
              <button
                onClick={finishPoints}
                className="px-6 py-3 bg-primary/20 text-primary border border-primary/30 rounded-md font-mono text-sm hover:bg-primary/30 transition-all border-glow backdrop-blur-sm"
              >
                ▸ RECOGNIZE ({placedPoints.length} pts)
              </button>
            </div>
          )}

          {/* Clear */}
          {(currentPath.length > 0 || placedPoints.length > 0) && (
            <div className="absolute bottom-16 right-4 z-20">
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
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
              <div className="px-6 py-4 bg-card/80 border border-destructive/30 rounded-md font-mono text-sm text-center backdrop-blur-sm">
                <div className="text-destructive">✗ NOT RECOGNIZED</div>
                <div className="text-muted-foreground text-xs mt-1">Try a clearer shape</div>
              </div>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="absolute bottom-4 left-4 z-20 font-mono text-xs max-w-[200px] pointer-events-none">
              <div className="text-muted-foreground mb-1">HISTORY</div>
              <div className="space-y-0.5">
                {history.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center gap-2" style={{ opacity: 0.3 + ((6 - i) / 6) * 0.7 }}>
                    <span style={{ color: s.color }}>●</span>
                    <span className="text-secondary-foreground">{s.type}</span>
                    <span className="text-muted-foreground">{s.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none font-mono text-[10px] text-muted-foreground/30">
            {mode === "draw" ? "draw a shape" : "click to place vertices"}
          </div>

          {/* Scanline */}
          <div className="absolute inset-0 scanline opacity-10 pointer-events-none" />
        </div>

        {/* Neural panel */}
        {showNeural && (
          <div className="w-1/2 h-full border-l border-border/30 bg-background">
            <NeuralViz
              inputPoints={activePoints}
              result={result}
              isProcessing={isProcessing}
            />
          </div>
        )}
      </div>
    </div>
  );
}
