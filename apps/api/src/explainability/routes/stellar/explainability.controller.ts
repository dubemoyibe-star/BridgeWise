import {
  Body,
  Controller,
  Param,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { StellarExplainabilityService } from './explainability.service';
import type {
  ExplainabilityRouteInspection,
  ExplainabilityResponse,
} from './explainability.service';
import type {
  RecommendationRequest,
  RouteInput,
} from '../../../services/recommendation';
import { UserPreference } from '../../../services/recommendation';

export class ExplainabilityRequestDto {
  sourceChain: string;
  destinationChain: string;
  token: string;
  amount: number;
  preference: UserPreference;
  routes: RouteInput[];
  minReliability?: number;
  maxFeeUsd?: number;
  maxTimeSeconds?: number;
}

export class ExplainabilityRouteInspectionDto {
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

export class ExplainabilityResponseDto {
  success: boolean;
  preference: UserPreference;
  strategyWeights: Record<string, number>;
  explanation: string;
  routeRankings: ExplainabilityRouteInspectionDto[];
  selectedRoute?: ExplainabilityRouteInspectionDto;
}

@ApiTags('Explainability')
@Controller('explainability/stellar')
export class StellarExplainabilityController {
  constructor(private readonly explainabilityService: StellarExplainabilityService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Explain route recommendation reasoning',
    description: 'Returns ranking factors, scoring breakdown, and selection reasoning for Stellar route recommendations.',
  })
  @ApiBody({ type: ExplainabilityRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Explainability response generated successfully',
    type: ExplainabilityResponseDto,
  })
  explain(@Body() request: ExplainabilityRequestDto): ExplainabilityResponse {
    const serviceRequest: RecommendationRequest = {
      routes: request.routes,
      preference: request.preference,
      minReliability: request.minReliability,
      maxFeeUsd: request.maxFeeUsd,
      maxTimeSeconds: request.maxTimeSeconds,
    };

    return this.explainabilityService.explain(serviceRequest);
  }

  @Post('inspect/:routeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inspect a specific route',
    description: 'Returns a detailed score breakdown and reasoning for a specific Stellar route.',
  })
  @ApiParam({
    name: 'routeId',
    type: 'string',
    description: 'Unique route identifier',
  })
  @ApiBody({ type: ExplainabilityRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Route inspection returned successfully',
    type: ExplainabilityRouteInspectionDto,
  })
  inspectRoute(
    @Param('routeId') routeId: string,
    @Body() request: ExplainabilityRequestDto,
  ): ExplainabilityRouteInspection | { success: false; message: string } {
    const serviceRequest: RecommendationRequest = {
      routes: request.routes,
      preference: request.preference,
      minReliability: request.minReliability,
      maxFeeUsd: request.maxFeeUsd,
      maxTimeSeconds: request.maxTimeSeconds,
    };

    const inspected = this.explainabilityService.inspectRoute(serviceRequest, routeId);
    if (!inspected) {
      return {
        success: false,
        message: `Route '${routeId}' not found in the provided route set.`,
      };
    }

    return inspected;
  }
}
