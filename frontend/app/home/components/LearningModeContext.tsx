"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface LearningModeContextType {
  learningMode: boolean;
  toggleLearningMode: () => void;
}

const LearningModeContext = createContext<LearningModeContextType>({
  learningMode: false,
  toggleLearningMode: () => {},
});

export function useLearningMode() {
  return useContext(LearningModeContext);
}

export function LearningModeProvider({ children }: { children: ReactNode }) {
  const [learningMode, setLearningMode] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("learningMode");
    if (stored === "true") setLearningMode(true);
  }, []);

  const toggleLearningMode = () => {
    setLearningMode((prev) => {
      const next = !prev;
      localStorage.setItem("learningMode", String(next));
      return next;
    });
  };

  return (
    <LearningModeContext.Provider value={{ learningMode, toggleLearningMode }}>
      {children}
    </LearningModeContext.Provider>
  );
}
