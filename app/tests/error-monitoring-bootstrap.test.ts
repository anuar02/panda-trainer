import { bootstrapErrorMonitoring } from '@/features/error-monitoring/bootstrap';

it('boots without monitoring configuration and performs no network request', async () => {
  const request = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
  try {
    const monitoring = bootstrapErrorMonitoring();
    expect(bootstrapErrorMonitoring()).toBe(monitoring);
    expect(await monitoring.report({ code: 'APP_FONT_LOAD_FAILED' })).toBe(
      false,
    );
    expect(request).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
  }
});
