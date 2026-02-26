import { useState, useEffect } from "react";
import type { DetectedPattern } from "./PatternCanvas";

interface HUDProps {
  detectedPatterns: DetectedPattern[];
  activePatterns: DetectedPattern[];
}

const SHAPE_ICONS: Record<string, string> = {
  LINE: "━━━",
  TRIANGLE: "△",
  SQUARE: "□",
  DIAMOND: "◇",
  PENTAGON: "⬠",
  HEXAGON: "⬡",
};

export default function HUD({ detectedPatterns, activePatterns }: HUDProps) {
  const [time, setTime] = useState("");
  const [scanAngle, setScanAngle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setScanAngle((a) => (a + 2) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Count by type
  const typeCounts: Record<string, number> = {};
  for (const p of detectedPatterns) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }

  const recentPatterns = detectedPatterns.slice(-8);

  return (
    <div className="fixed inset-0 pointer-events-none z-10">
      {/* Scanline */}
      <div className="absolute inset-0 scanline opacity-20" />

      {/* Top left */}
      <div className="absolute top-6 left-6 font-mono text-xs animate-fade-in">
        <div className="text-muted-foreground mb-1">PATTERN RECOGNITION v3.0</div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
          <span className="text-primary">GEOMETRIC ANALYSIS</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{time}</span>
        </div>
      </div>

      {/* Top right - Total count */}
      <div className="absolute top-6 right-6 font-mono text-xs text-right animate-fade-in">
        <div className="text-muted-foreground">SHAPES DETECTED</div>
        <div className="text-2xl font-display font-bold text-primary text-glow mt-1">
          {detectedPatterns.length.toString().padStart(3, "0")}
        </div>
      </div>

      {/* Shape counters */}
      <div className="absolute top-20 right-6 font-mono text-xs text-right animate-fade-in space-y-1">
        {Object.entries(typeCounts).map(([type, count]) => (
          <div key={type} className="flex items-center justify-end gap-2">
            <span className="text-muted-foreground">{type}</span>
            <span className="text-secondary-foreground opacity-60">
              {SHAPE_ICONS[type] || "●"}
            </span>
            <span className="text-primary w-6 text-right">{count}</span>
          </div>
        ))}
      </div>

      {/* Active patterns indicator */}
      {activePatterns.length > 0 && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 font-mono text-xs animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-2 rounded-md bg-card/60 border border-border/30 border-glow">
            <span className="text-primary animate-pulse-glow">●</span>
            <span className="text-secondary-foreground">
              {activePatterns.length} active pattern{activePatterns.length !== 1 ? "s" : ""}
            </span>
            {activePatterns.map((p, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: p.color.replace(/[\d.]+\)$/, "0.15)"),
                  color: p.color,
                }}
              >
                {p.type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bottom left - Detection log */}
      <div className="absolute bottom-6 left-6 font-mono text-xs animate-fade-in max-w-xs">
        <div className="text-muted-foreground mb-2">DETECTION LOG</div>
        <div className="space-y-0.5">
          {recentPatterns.length === 0 && (
            <div className="text-muted-foreground/50">analyzing node positions...</div>
          )}
          {recentPatterns.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ opacity: 0.3 + (i / recentPatterns.length) * 0.7 }}
            >
              <span style={{ color: p.color }}>{SHAPE_ICONS[p.type] || "●"}</span>
              <span className="text-secondary-foreground">{p.type}</span>
              <span className="text-muted-foreground">
                {p.vertices}v · {p.confidence}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom right */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3 font-mono text-xs animate-fade-in">
        <span className="text-muted-foreground">SCAN</span>
        <svg width="28" height="28" viewBox="0 0 28 28" className="text-primary">
          <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
          <line x1="14" y1="14" x2="14" y2="3" stroke="currentColor" strokeWidth="1" opacity="0.8" transform={`rotate(${scanAngle}, 14, 14)`} />
          <circle cx="14" cy="14" r="2" fill="currentColor" opacity="0.6" />
        </svg>
      </div>

      {/* Center hint */}
      <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-[45vh] font-mono text-xs text-muted-foreground/25">
        mueve el cursor para agrupar nodos y formar figuras
      </div>
    </div>
  );
}
