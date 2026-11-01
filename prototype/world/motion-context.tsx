'use client';
import { createContext, useContext } from 'react';
import type { MotionSignals } from './motion';
export const WorldMotionContext = createContext<{
  paused: boolean;
  reduced: boolean;
  signals: MotionSignals;
} | null>(null);
export const useWorldMotion = () => useContext(WorldMotionContext);
