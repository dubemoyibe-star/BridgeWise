import { Injectable } from '@nestjs/common';
import {
  SmartRecommendationService,
  RecommendationRequest,
  RecommendationResult,
  UserPreference,
  RouteInput,
  PreferenceWeights,
} from '../../../services/recommendation';

export interface ExplainabilityRouteInspection {
  routeId: string;
  breakDown: {
    costScore: number;
    speedScore: number;
    reliabilityScore: number;
    slippageScore: number;
    liquidityScore: number;
  };
  score: number;
  rank: number;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface ExplainabilityResponse {
  success: boolean;
  preference: UserPreference;
  strategyWeights: PreferenceWeights;
  explanation: string;
  routeRankings: ExplainabilityRouteInspection[];
  selectedRoute?: ExplainabilityRouteInspection;
}

@Injectable()
export class StellarExplainabilityService {
  constructor(private readonly recommendationService: SmartRecommendationService) {}

  explain(request: RecommendationRequest): ExplainabilityResponse {
    const rankedRoutes = this.recommendationService.recommend(request);
    const strategyWeights = this.recommendationService.getWeightProfile(request.preference);

    const routeRankings = rankedRoutes.map(routeResult => ({
      routeId: routeResult.route.id,
      breakDown: routeResult.breakdown,
      score: routeResult.score,
      rank: routeResult.rank,
      recommendation: routeResult.recommendation,
      confidence: routeResult.confidence,
      reason: this.getRouteReason(routeResult),
    }));

    const selectedRoute = routeRankings[0];

    return {
      success: true,
      preference: request.preference,
      strategyWeights,
      explanation: `Selected the top ranked route based on preference '${request.preference}' and weighted scores for cost, speed, reliability, slippage, and liquidity.`,
      routeRankings,
      selectedRoute,
    };
  }

  inspectRoute(request: RecommendationRequest, routeId: string): ExplainabilityRouteInspection | null {
    const rankedRoutes = this.recommendationService.recommend(request);
    const inspected = rankedRoutes.find(r => r.route.id === routeId);
    if (!inspected) {
      return null;
    }

    return {
      routeId: inspected.route.id,
      breakDown: inspected.breakdown,
      score: inspected.score,
      rank: inspected.rank,
      recommendation: inspected.recommendation,
      confidence: inspected.confidence,
      reason: this.getRouteReason(inspected),
    };
  }

  private getRouteReason(result: RecommendationResult): string {
    return `Route '${result.route.bridgeName}' scored ${result.score.toFixed(2)} based on cost (${result.breakdown.costScore}), speed (${result.breakdown.speedScore}), reliability (${result.breakdown.reliabilityScore}), slippage (${result.breakdown.slippageScore}), and liquidity (${result.breakdown.liquidityScore}).`;
  }
}
