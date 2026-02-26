import { useState, useCallback } from "react";
import PatternCanvas, { type DetectedPattern } from "@/components/PatternCanvas";
import HUD from "@/components/HUD";

const Index = () => {
  const [allPatterns, setAllPatterns] = useState<DetectedPattern[]>([]);
  const [activePatterns, setActivePatterns] = useState<DetectedPattern[]>([]);

  const handlePattern = useCallback((pattern: DetectedPattern) => {
    setAllPatterns((prev) => [...prev, pattern]);
  }, []);

  const handlePatternsUpdate = useCallback((patterns: DetectedPattern[]) => {
    setActivePatterns(patterns);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <PatternCanvas
        onPatternDetected={handlePattern}
        onPatternsUpdate={handlePatternsUpdate}
      />
      <HUD detectedPatterns={allPatterns} activePatterns={activePatterns} />
    </div>
  );
};

export default Index;
