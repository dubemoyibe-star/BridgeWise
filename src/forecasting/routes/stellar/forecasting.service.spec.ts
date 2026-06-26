import { StellarRouteForecastingService } from './forecasting.service';

describe('StellarRouteForecastingService', () => {
  let service: StellarRouteForecastingService;

  beforeEach(() => {
    service = new StellarRouteForecastingService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate forecast', () => {
    const forecast = service.generateForecast('route-1');
    expect(forecast.routeId).toEqual('route-1');
    expect(forecast.predictedLatency).toBeDefined();
  });
});
