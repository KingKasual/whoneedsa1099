import federalJson from './federal-ty2026.json';
import statesJson from './states-ty2026.json';
import type { FederalRules, StateTable } from './types';

export const FEDERAL = federalJson as FederalRules & typeof federalJson;
export const STATES = statesJson as StateTable;
export * from './types';
export * from './engine';
