import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export enum RankingPreference {
  FEE = 'FEE',
  TIME = 'TIME',
  SECURITY = 'SECURITY',
  BALANCED = 'BALANCED',
  RELIABILITY = 'RELIABILITY',
}

export class BridgeRouteDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  bridgeName: string;

  @ApiProperty()
  @IsString()
  sourceChain: string;

  @ApiProperty()
  @IsString()
  destinationChain: string;

  @ApiProperty()
  @IsNumber()
  fee: number;

  @ApiProperty()
  @IsNumber()
  slippage: number;

  @ApiProperty()
  @IsNumber()
  estimatedTime: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  reliabilityScore?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  securityScore?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  liquidity?: number;
}

export class AdvancedFiltersDto {
  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  minLiquidity?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  maxFee?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  maxTime?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  maxSlippage?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  minSecurityScore?: number;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludedBridges?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredBridges?: string[];
}

export class RecommendationRequestV2Dto {
  @ApiProperty({ type: [BridgeRouteDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BridgeRouteDto)
  routes: BridgeRouteDto[];

  @ApiProperty({ enum: RankingPreference, default: RankingPreference.BALANCED })
  @IsEnum(RankingPreference)
  @IsOptional()
  preference?: RankingPreference = RankingPreference.BALANCED;

  @ApiPropertyOptional({ type: AdvancedFiltersDto })
  @ValidateNested()
  @Type(() => AdvancedFiltersDto)
  @IsOptional()
  filters?: AdvancedFiltersDto;
}

export class RecommendationInsightDto {
  @ApiProperty()
  reason: string;

  @ApiProperty()
  factors: Record<string, any>;
}

export class RankedRouteV2Dto {
  @ApiProperty({ type: BridgeRouteDto })
  route: BridgeRouteDto;

  @ApiProperty()
  score: number;

  @ApiProperty()
  rank: number;

  @ApiProperty({ type: RecommendationInsightDto })
  insight: RecommendationInsightDto;
}

export class RecommendationResponseV2Dto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [RankedRouteV2Dto] })
  recommendations: RankedRouteV2Dto[];
}
