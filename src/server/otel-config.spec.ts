import {
  configRelay,
  observabilityUrl,
  parseResourceAttributes,
  telemetryTarget,
} from './otel-config';

describe('observabilityUrl', () => {
  it('derives the receiver from QITS_ENVIRONMENT', () => {
    expect(observabilityUrl({ QITS_ENVIRONMENT: 'prod' })).toBe(
      'http://prod-qits-observability:8080',
    );
  });

  it('falls back to the dev environment', () => {
    expect(observabilityUrl({})).toBe('http://dev-qits-observability:8080');
    expect(observabilityUrl({ QITS_ENVIRONMENT: ' ' })).toBe('http://dev-qits-observability:8080');
  });

  it('takes QITS_OBSERVABILITY_URL as given, without a trailing slash', () => {
    expect(
      observabilityUrl({ QITS_OBSERVABILITY_URL: 'http://localhost:4318/', QITS_ENVIRONMENT: 'x' }),
    ).toBe('http://localhost:4318');
  });
});

describe('parseResourceAttributes', () => {
  it('reads what qits-deployments injects', () => {
    expect(
      parseResourceAttributes(
        'service.version=abc123,deployment.environment.name=dev,service.instance.id=dev-qits-landing',
      ),
    ).toEqual({
      'service.version': 'abc123',
      'deployment.environment.name': 'dev',
      'service.instance.id': 'dev-qits-landing',
    });
  });

  it('decodes values and skips malformed pairs', () => {
    expect(parseResourceAttributes('a=b%2Cc, =x,nothing,d=%E0')).toEqual({ a: 'b,c', d: '%E0' });
    expect(parseResourceAttributes(undefined)).toEqual({});
  });
});

describe('telemetryTarget', () => {
  it('is the ingest path on the receiver, named after the deployed application', () => {
    expect(
      telemetryTarget({
        QITS_ENVIRONMENT: 'dev',
        QITS_APPLICATION: 'qits-landing',
        OTEL_RESOURCE_ATTRIBUTES: 'service.version=abc,service.name=ignored',
      }),
    ).toEqual({
      endpoint: 'http://dev-qits-observability:8080/observability/api/otel',
      serviceName: 'qits-landing',
      resourceAttributes: { 'service.version': 'abc', 'service.name': 'qits-landing' },
    });
  });

  it('defaults the service name to qits-landing', () => {
    expect(telemetryTarget({})?.serviceName).toBe('qits-landing');
  });

  it('is off with OTEL_SDK_DISABLED=true', () => {
    expect(telemetryTarget({ OTEL_SDK_DISABLED: 'true' })).toBeNull();
    expect(telemetryTarget({ OTEL_SDK_DISABLED: 'false' })).not.toBeNull();
  });
});

describe('configRelay', () => {
  it('keeps the browser dark without a target', () => {
    expect(configRelay(null)).toEqual({ telemetry: null, capture: null });
  });

  it('reports the service name and resource without the endpoint', () => {
    const target = telemetryTarget({ QITS_ENVIRONMENT: 'dev' });
    expect(configRelay(target)).toEqual({
      telemetry: {
        serviceName: 'qits-landing',
        resourceAttributes: { 'service.name': 'qits-landing' },
      },
      capture: null,
    });
  });
});
