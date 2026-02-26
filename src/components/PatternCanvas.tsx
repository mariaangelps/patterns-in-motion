import { useRef, useEffect, useCallback } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  group: number;
  phase: number;
  connected: boolean;
}

interface Pattern {
  name: string;
  nodes: number[];
  detected: boolean;
  progress: number;
  color: string;
  timestamp: number;
}

const PATTERN_NAMES = [
  "TRIANGLE", "HEXAGON", "DIAMOND", "CONSTELLATION",
  "HELIX", "MATRIX", "LATTICE", "SPIRAL", "GRID", "WAVE"
];

const COLORS = {
  primary: [175, 80, 50],
  accent: [280, 60, 55],
  warm: [35, 90, 55],
  cool: [210, 70, 60],
};

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

export default function PatternCanvas({
  onPatternDetected,
}: {
  onPatternDetected?: (name: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const patternsRef = useRef<Pattern[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const timeRef = useRef(0);
  const lastPatternRef = useRef(0);

  const initNodes = useCallback((w: number, h: number) => {
    const count = Math.min(120, Math.floor((w * h) / 8000));
    const nodes: Node[] = [];
    for (let i = 0; i < count; i++) {
      const group = Math.floor(Math.random() * 4);
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: 2,
        baseRadius: 1.5 + Math.random() * 1.5,
        group,
        phase: Math.random() * Math.PI * 2,
        connected: false,
      });
    }
    nodesRef.current = nodes;
  }, []);

  const detectPattern = useCallback((time: number) => {
    if (time - lastPatternRef.current < 3000) return;
    const nodes = nodesRef.current;
    if (nodes.length < 3) return;

    // Pick random cluster of nearby nodes
    const pivot = Math.floor(Math.random() * nodes.length);
    const nearby = nodes
      .map((n, i) => ({
        i,
        d: Math.hypot(n.x - nodes[pivot].x, n.y - nodes[pivot].y),
      }))
      .filter((n) => n.d < 200 && n.d > 10)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3 + Math.floor(Math.random() * 4));

    if (nearby.length < 3) return;

    const colorKeys = Object.keys(COLORS) as (keyof typeof COLORS)[];
    const ck = colorKeys[Math.floor(Math.random() * colorKeys.length)];
    const c = COLORS[ck];

    const pattern: Pattern = {
      name: PATTERN_NAMES[Math.floor(Math.random() * PATTERN_NAMES.length)],
      nodes: [pivot, ...nearby.map((n) => n.i)],
      detected: false,
      progress: 0,
      color: hsl(c[0], c[1], c[2]),
      timestamp: time,
    };

    patternsRef.current.push(pattern);
    lastPatternRef.current = time;
    onPatternDetected?.(pattern.name);
  }, [onPatternDetected]);

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
      timeRef.current = timestamp;
      const w = canvas.width;
      const h = canvas.height;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;

      // Clear with trail effect
      ctx.fillStyle = "rgba(8, 10, 14, 0.15)";
      ctx.fillRect(0, 0, w, h);

      // Update nodes
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.connected = false;

        // Mouse attraction
        const dx = mouse.x - node.x;
        const dy = mouse.y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 250 && dist > 1) {
          node.vx += (dx / dist) * 0.015;
          node.vy += (dy / dist) * 0.015;
        }

        // Damping
        node.vx *= 0.995;
        node.vy *= 0.995;

        // Bounds
        if (node.x < 0 || node.x > w) node.vx *= -1;
        if (node.y < 0 || node.y > h) node.vy *= -1;
        node.x = Math.max(0, Math.min(w, node.x));
        node.y = Math.max(0, Math.min(h, node.y));

        // Pulse radius
        node.radius =
          node.baseRadius +
          Math.sin(timestamp * 0.002 + node.phase) * 0.8;
      }

      // Draw connections
      const connectionDist = 140;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < connectionDist) {
            const alpha = (1 - d / connectionDist) * 0.2;
            ctx.strokeStyle = hsl(175, 60, 50, alpha);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
            nodes[i].connected = true;
            nodes[j].connected = true;
          }
        }
      }

      // Draw & update patterns
      patternsRef.current = patternsRef.current.filter((p) => {
        const age = timestamp - p.timestamp;
        if (age > 4000) return false;

        p.progress = Math.min(1, age / 800);
        const fadeOut = age > 3000 ? 1 - (age - 3000) / 1000 : 1;

        const pNodes = p.nodes
          .filter((i) => i < nodes.length)
          .map((i) => nodes[i]);

        if (pNodes.length < 2) return false;

        // Draw pattern connections
        ctx.lineWidth = 1.5;
        for (let i = 0; i < pNodes.length; i++) {
          for (let j = i + 1; j < pNodes.length; j++) {
            const segProgress = Math.min(
              1,
              (p.progress * pNodes.length - i) * 2
            );
            if (segProgress <= 0) continue;

            const a = pNodes[i];
            const b = pNodes[j];
            const mx = a.x + (b.x - a.x) * segProgress;
            const my = a.y + (b.y - a.y) * segProgress;

            ctx.strokeStyle = p.color.replace("1)", `${0.6 * fadeOut})`).replace("hsla", "hsla").includes("hsla") 
              ? p.color.replace(/[\d.]+\)$/, `${0.6 * fadeOut})`)
              : p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8 * fadeOut;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mx, my);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        // Draw highlight on pattern nodes
        for (const n of pNodes) {
          ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${0.8 * fadeOut})`);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 15 * fadeOut;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius * 2.5 * p.progress, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Draw label
        if (p.progress > 0.5) {
          const cx = pNodes.reduce((s, n) => s + n.x, 0) / pNodes.length;
          const cy = pNodes.reduce((s, n) => s + n.y, 0) / pNodes.length - 25;
          const labelAlpha = Math.min(1, (p.progress - 0.5) * 4) * fadeOut;
          ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = hsl(175, 60, 80, labelAlpha);
          ctx.fillText(`[ ${p.name} ]`, cx, cy);
          
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillStyle = hsl(175, 40, 55, labelAlpha * 0.7);
          ctx.fillText(`${pNodes.length} nodes · confidence ${Math.floor(70 + Math.random() * 29)}%`, cx, cy + 15);
        }

        return true;
      });

      // Draw nodes
      for (const node of nodes) {
        const mouseDist = Math.hypot(mouse.x - node.x, mouse.y - node.y);
        const mouseInfluence = Math.max(0, 1 - mouseDist / 200);

        const glow = node.connected ? 0.7 : 0.3;
        const brightness = 50 + mouseInfluence * 30;

        ctx.fillStyle = hsl(175, 60 + mouseInfluence * 30, brightness, glow + mouseInfluence * 0.3);
        ctx.shadowColor = hsl(175, 80, 50, 0.5);
        ctx.shadowBlur = mouseInfluence * 12;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + mouseInfluence * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Trigger pattern detection
      if (Math.random() < 0.008) detectPattern(timestamp);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
    };
  }, [initNodes, detectPattern]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: "hsl(220, 20%, 4%)" }}
    />
  );
}
