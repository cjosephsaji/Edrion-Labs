export type PetrosSpeechOptions = {
  state: 'ready' | 'unavailable'; voices: string[]; reason: string;
  routeId?: string; modelKey?: string; providerKey?: string;
};
export type PetrosSpeechReceipt = {
  requestedVoice: string;
  effective: { voice: string; modelKey: string; providerKey: string; routeId: string };
  fallback: { voice: boolean; route: boolean };
};
