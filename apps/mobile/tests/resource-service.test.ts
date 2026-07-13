import { ResourceService } from '@/services/resource-service';
import { fixtureSource } from '@/fixtures/sanitized';

describe('ResourceService', () => {
  it('updates one resource and falls back to its own cache only', async () => {
    const cached = { value: 1, source: fixtureSource };
    const repository = {
      getResource: vi.fn().mockResolvedValue(cached), saveResource: vi.fn(), deleteResource: vi.fn(),
    };
    const service = new ResourceService(repository);
    await expect(service.load('aliases', 1, async () => { throw new Error('offline'); })).resolves.toMatchObject({ value: 1, source: { kind: 'cache', isStale: true } });
    expect(repository.getResource).toHaveBeenCalledWith('aliases', 1);
    expect(repository.deleteResource).not.toHaveBeenCalled();
  });
});
