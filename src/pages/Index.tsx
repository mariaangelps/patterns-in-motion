import { useState, useCallback } from "react";
import PatternCanvas from "@/components/PatternCanvas";
import HUD from "@/components/HUD";

const Index = () => {
  const [patterns, setPatterns] = useState<string[]>([]);

  const handlePattern = useCallback((name: string) => {
    setPatterns((prev) => [...prev, name]);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <PatternCanvas onPatternDetected={handlePattern} />
      <HUD detectedPatterns={patterns} />
    </div>
  );
};

export default Index;
