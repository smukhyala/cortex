import { ExchangeOrchestrator } from "@/pipeline/agents/exchange-orchestrator";
import type { ExchangeFact, ExchangeOrigin, ExchangeOrchestratorInput } from "@/contracts/exchange";

interface ExchangeIngestParams {
  origin: ExchangeOrigin;
  facts: ExchangeFact[];
  topic?: string;
  summary?: string;
  propagate?: boolean;
}

export interface ExchangeIngestResult {
  sourceId: string;
  memoriesCreated: number;
  referencesUpdated: number;
  conflictsCreated: number;
  reviewItemsCreated: number;
  newMemoriesAutoApproved: number;
  newMemoriesQueuedForReview: number;
  propagatedDestinations: Array<{ type: string; name: string; success: boolean; error?: string }>;
}

export async function ingestExchangeFacts(params: ExchangeIngestParams): Promise<ExchangeIngestResult> {
  const orchestrator = new ExchangeOrchestrator();
  const result = await orchestrator.run({
    origin: params.origin,
    facts: params.facts as ExchangeOrchestratorInput["facts"],
    topic: params.topic,
    summary: params.summary,
    propagate: params.propagate ?? true,
  });
  return {
    sourceId: result.sourceId,
    memoriesCreated: result.memoriesCreated,
    referencesUpdated: result.referencesUpdated,
    conflictsCreated: result.conflictsCreated,
    reviewItemsCreated: result.reviewItemsCreated,
    newMemoriesAutoApproved: result.newMemoriesAutoApproved,
    newMemoriesQueuedForReview: result.newMemoriesQueuedForReview,
    propagatedDestinations: result.propagatedDestinations,
  };
}
