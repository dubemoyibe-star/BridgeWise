import { Module } from '@nestjs/common';
import { RecommendationV2Controller } from './recommendation.controller';
import { RecommendationV2Service } from './recommendation.service';

@Module({
  controllers: [RecommendationV2Controller],
  providers: [RecommendationV2Service],
  exports: [RecommendationV2Service],
})
export class RecommendationV2Module {}
