"use client";

import { createContext, useContext, type ReactNode } from "react";

interface LearningModeContextType {
  learningMode: boolean;
}

const LearningModeContext = createContext<LearningModeContextType>({
  learningMode: true,
});

export function useLearningMode() {
  return useContext(LearningModeContext);
}

export function LearningModeProvider({ children }: { children: ReactNode }) {
  return (
    <LearningModeContext.Provider value={{ learningMode: true }}>
      {children}
    </LearningModeContext.Provider>
  );
}
