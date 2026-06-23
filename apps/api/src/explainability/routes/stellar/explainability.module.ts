import { Module } from '@nestjs/common';
import { StellarExplainabilityController } from './explainability.controller';
import { StellarExplainabilityService } from './explainability.service';
import { SmartRecommendationService } from '../../../services/recommendation';

@Module({
  controllers: [StellarExplainabilityController],
  providers: [StellarExplainabilityService, SmartRecommendationService],
})
export class StellarExplainabilityModule {}
