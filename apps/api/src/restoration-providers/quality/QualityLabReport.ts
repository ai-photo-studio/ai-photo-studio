import type { QualityLabSummary } from "./QualityLabService";
import type { BenchmarkCategory } from "../golden/GoldenBenchmarkDataset";

export interface ProviderRanking {
  providerName: string;
  rank: number;
  score: number;
  category: string;
}

export interface QualityLabReport {
  benchmarkVersion: string;
  generatedAt: string;
  providers: QualityLabSummary[];
  rankings: {
    portrait: ProviderRanking[];
    document: ProviderRanking[];
    blackAndWhite: ProviderRanking[];
    heavyRestoration: ProviderRanking[];
    printQuality: ProviderRanking[];
    overall: ProviderRanking[];
  };
  bestOverall: string;
  bestByCategory: Record<string, string>;
}

export class QualityLabReportGenerator {
  generateReport(summaries: QualityLabSummary[], benchmarkVersion: string): QualityLabReport {
    const rankings = {
      portrait: this.rankByCategory(summaries, "portrait"),
      document: this.rankByCategory(summaries, "document"),
      blackAndWhite: this.rankByCategory(summaries, "black_and_white"),
      heavyRestoration: this.rankByCategory(summaries, "heavy_scratch"),
      printQuality: this.rankByPrintQuality(summaries),
      overall: this.rankByOverall(summaries),
    };

    const bestOverall = rankings.overall.length > 0 ? rankings.overall[0].providerName : "none";

    const bestByCategory: Record<string, string> = {};
    for (const [category, ranking] of Object.entries(rankings)) {
      if (ranking.length > 0) {
        bestByCategory[category] = ranking[0].providerName;
      }
    }

    return {
      benchmarkVersion,
      generatedAt: new Date().toISOString(),
      providers: summaries,
      rankings,
      bestOverall,
      bestByCategory,
    };
  }

  private rankByCategory(summaries: QualityLabSummary[], category: BenchmarkCategory): ProviderRanking[] {
    return summaries
      .map((summary) => {
        const categoryScore = summary.categoryScores[category];
        return {
          providerName: summary.providerName,
          rank: 0,
          score: categoryScore?.overall ?? 0,
          category,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private rankByPrintQuality(summaries: QualityLabSummary[]): ProviderRanking[] {
    return summaries
      .map((summary) => {
        const printScores = Object.values(summary.categoryScores).map((s) => s.printQuality);
        const avgPrintQuality = printScores.length > 0
          ? printScores.reduce((a, b) => a + b, 0) / printScores.length
          : 0;

        return {
          providerName: summary.providerName,
          rank: 0,
          score: Math.round(avgPrintQuality),
          category: "print_quality",
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  private rankByOverall(summaries: QualityLabSummary[]): ProviderRanking[] {
    return summaries
      .map((summary) => ({
        providerName: summary.providerName,
        rank: 0,
        score: summary.overallScore,
        category: "overall",
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  getBestProviderForCategory(report: QualityLabReport, category: string): ProviderRanking | undefined {
    const ranking = this.getRankingForCategory(report, category);
    return ranking[0];
  }

  getRankingForCategory(report: QualityLabReport, category: string): ProviderRanking[] {
    switch (category) {
      case "portrait":
        return report.rankings.portrait;
      case "document":
        return report.rankings.document;
      case "black_and_white":
        return report.rankings.blackAndWhite;
      case "heavy_restoration":
        return report.rankings.heavyRestoration;
      case "print_quality":
        return report.rankings.printQuality;
      case "overall":
        return report.rankings.overall;
      default:
        return [];
    }
  }

  getProviderRanking(report: QualityLabReport, providerName: string): { category: string; rank: number; score: number }[] {
    const rankings: { category: string; rank: number; score: number }[] = [];

    for (const [categoryName, ranking] of Object.entries(report.rankings)) {
      const entry = ranking.find((e) => e.providerName === providerName);
      if (entry) {
        rankings.push({
          category: categoryName,
          rank: entry.rank,
          score: entry.score,
        });
      }
    }

    return rankings;
  }

  getOverallRanking(report: QualityLabReport): ProviderRanking[] {
    return report.rankings.overall;
  }

  formatReport(report: QualityLabReport): string {
    const lines: string[] = [];
    lines.push(`# Quality Laboratory Report`);
    lines.push(`Benchmark Version: ${report.benchmarkVersion}`);
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Best Overall: ${report.bestOverall}`);
    lines.push("");

    for (const [category, ranking] of Object.entries(report.rankings)) {
      lines.push(`## ${category.toUpperCase()}`);
      for (const entry of ranking) {
        lines.push(`  ${entry.rank}. ${entry.providerName} — Score: ${entry.score}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
