import { ResourceService, staleCachedResource } from '@/services/resource-service';
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

  it('reads cached resources without touching the network', async () => {
    const cached = { value: 1, source: fixtureSource };
    const repository = {
      getResource: vi.fn().mockResolvedValue(cached), saveResource: vi.fn(), deleteResource: vi.fn(),
    };
    const service = new ResourceService(repository);
    await expect(service.getCached('plates', 2)).resolves.toEqual(cached);
    expect(repository.getResource).toHaveBeenCalledWith('plates', 2);
  });

  it('returns null when the repository has no cache', async () => {
    const repository = {
      getResource: vi.fn().mockResolvedValue(null), saveResource: vi.fn(), deleteResource: vi.fn(),
    };
    await expect(new ResourceService(repository).getCached('plates', 2)).resolves.toBeNull();
  });

  it('marks cache-first resources as stale without rewriting the label', () => {
    const marked = staleCachedResource({ value: 1, source: fixtureSource });
    expect(marked.source.kind).toBe('cache');
    expect(marked.source.isStale).toBe(true);
    expect(marked.source.label).toBe(fixtureSource.label);
  });
});
