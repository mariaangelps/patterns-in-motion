import { useState, useEffect } from "react";

interface HUDProps {
  detectedPatterns: string[];
}

export default function HUD({ detectedPatterns }: HUDProps) {
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

  const recentPatterns = detectedPatterns.slice(-6);

  return (
    <div className="fixed inset-0 pointer-events-none z-10">
      {/* Scanline overlay */}
      <div className="absolute inset-0 scanline opacity-30" />

      {/* Top left - Status */}
      <div className="absolute top-6 left-6 font-mono text-xs animate-fade-in">
        <div className="text-muted-foreground mb-1">PATTERN RECOGNITION v2.4</div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow"
          />
          <span className="text-primary">ACTIVE</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{time}</span>
        </div>
      </div>

      {/* Top right - Stats */}
      <div className="absolute top-6 right-6 font-mono text-xs text-right animate-fade-in">
        <div className="text-muted-foreground">PATTERNS DETECTED</div>
        <div className="text-2xl font-display font-bold text-primary text-glow mt-1">
          {detectedPatterns.length.toString().padStart(3, "0")}
        </div>
      </div>

      {/* Bottom left - Pattern log */}
      <div className="absolute bottom-6 left-6 font-mono text-xs animate-fade-in">
        <div className="text-muted-foreground mb-2">DETECTION LOG</div>
        <div className="space-y-0.5">
          {recentPatterns.length === 0 && (
            <div className="text-muted-foreground/50">scanning...</div>
          )}
          {recentPatterns.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{
                opacity: 0.4 + (i / recentPatterns.length) * 0.6,
              }}
            >
              <span className="text-primary">›</span>
              <span className="text-secondary-foreground">{p}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom right - Scan indicator */}
      <div className="absolute bottom-6 right-6 flex items-center gap-3 font-mono text-xs animate-fade-in">
        <span className="text-muted-foreground">SCAN</span>
        <svg width="28" height="28" viewBox="0 0 28 28" className="text-primary">
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.3"
          />
          <line
            x1="14"
            y1="14"
            x2="14"
            y2="3"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.8"
            transform={`rotate(${scanAngle}, 14, 14)`}
          />
          <circle cx="14" cy="14" r="2" fill="currentColor" opacity="0.6" />
        </svg>
      </div>

      {/* Center hint */}
      <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 translate-y-[45vh] font-mono text-xs text-muted-foreground/30">
        move cursor to attract particles
      </div>
    </div>
  );
}
