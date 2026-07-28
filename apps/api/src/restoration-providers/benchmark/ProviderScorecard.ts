import type { ProviderScore } from "../policy/ProviderPolicyEngine";
import type { BenchmarkSummary } from "./ProviderBenchmarkService";

export interface ScorecardEntry {
  providerName: string;
  category: string;
  score: number;
  rank: number;
  lastUpdated: string;
}

export interface ScorecardCategory {
  name: string;
  entries: ScorecardEntry[];
}

export interface ProviderScorecard {
  categories: ScorecardCategory[];
  lastUpdated: string;
  bestOverall: string;
}

export class ProviderScorecardGenerator {
  generateScorecard(summaries: BenchmarkSummary[]): ProviderScorecard {
    const categories: ScorecardCategory[] = [];

    const restorationEntries = this.createEntries(summaries, "restorationScore", "Restoration");
    const colorizationEntries = this.createEntries(summaries, "colorizationScore", "Colorization");
    const faceRestorationEntries = this.createEntries(summaries, "faceRestorationScore", "Face Restoration");
    const printQualityEntries = this.createEntries(summaries, "printQualityScore", "Print Quality");
    const costEntries = this.createEntries(summaries, "costScore", "Cost Efficiency");
    const latencyEntries = this.createEntries(summaries, "latencyScore", "Latency");
    const reliabilityEntries = this.createEntries(summaries, "reliabilityScore", "Reliability");
    const overallEntries = this.createEntries(summaries, "overallScore", "Overall");

    categories.push(
      { name: "Restoration", entries: restorationEntries },
      { name: "Colorization", entries: colorizationEntries },
      { name: "Face Restoration", entries: faceRestorationEntries },
      { name: "Print Quality", entries: printQualityEntries },
      { name: "Cost Efficiency", entries: costEntries },
      { name: "Latency", entries: latencyEntries },
      { name: "Reliability", entries: reliabilityEntries },
      { name: "Overall", entries: overallEntries },
    );

    const bestOverall = overallEntries.length > 0 ? overallEntries[0].providerName : "none";

    return {
      categories,
      lastUpdated: new Date().toISOString(),
      bestOverall,
    };
  }

  private createEntries(
    summaries: BenchmarkSummary[],
    scoreKey: keyof ProviderScore,
    categoryName: string
  ): ScorecardEntry[] {
    return summaries
      .map((summary) => ({
        providerName: summary.providerName,
        category: categoryName,
        score: summary.score[scoreKey] as number,
        rank: 0,
        lastUpdated: summary.score.lastUpdated,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  getBestProviderForCategory(scorecard: ProviderScorecard, categoryName: string): ScorecardEntry | undefined {
    const category = scorecard.categories.find((c) => c.name === categoryName);
    return category?.entries[0];
  }

  getProviderRanking(scorecard: ProviderScorecard, providerName: string): { category: string; rank: number; score: number }[] {
    const rankings: { category: string; rank: number; score: number }[] = [];

    for (const category of scorecard.categories) {
      const entry = category.entries.find((e) => e.providerName === providerName);
      if (entry) {
        rankings.push({
          category: category.name,
          rank: entry.rank,
          score: entry.score,
        });
      }
    }

    return rankings;
  }

  getOverallRanking(scorecard: ProviderScorecard): ScorecardEntry[] {
    const overall = scorecard.categories.find((c) => c.name === "Overall");
    return overall?.entries ?? [];
  }
}
