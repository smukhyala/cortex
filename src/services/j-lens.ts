// Stub — will be implemented by another task
export async function decayAllSlots(): Promise<{ decayed: number; evicted: number }> {
  throw new Error("decayAllSlots not yet implemented");
}

export async function scoreBatch(): Promise<{ loaded: number; evicted: number }> {
  throw new Error("scoreBatch not yet implemented");
}

export async function coldStart(): Promise<number> {
  throw new Error("coldStart not yet implemented");
}
