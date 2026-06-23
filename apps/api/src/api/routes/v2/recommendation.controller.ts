import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RecommendationRequestV2Dto, RecommendationResponseV2Dto } from './dto/recommendation.dto';
import { RecommendationV2Service } from './recommendation.service';

@ApiTags('Recommendations V2')
@Controller('v2/recommendations')
export class RecommendationV2Controller {
  constructor(private readonly recommendationService: RecommendationV2Service) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get smart bridge route recommendations with advanced filters',
    description: 'Returns ranked bridge routes based on advanced filters, ranking preferences, and generates actionable insights.',
  })
  @ApiBody({ type: RecommendationRequestV2Dto })
  @ApiResponse({
    status: 200,
    description: 'Recommendations generated successfully',
    type: RecommendationResponseV2Dto,
  })
  async getRecommendations(@Body() request: RecommendationRequestV2Dto): Promise<RecommendationResponseV2Dto> {
    const recommendations = this.recommendationService.recommend(request);

    return {
      success: true,
      recommendations,
    };
  }
}
