export const DEAD_LETTER_STORE = Symbol('DEAD_LETTER_STORE');

export interface DeadLetterEntry {
  eventName: string;
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  failedAt: string;
}

export interface DeadLetterStore {
  save(entry: DeadLetterEntry): Promise<void>;
}
