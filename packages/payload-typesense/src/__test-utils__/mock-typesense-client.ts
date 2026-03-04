import { vi } from 'vitest'

interface MockDocumentOps {
  upsert: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  search: ReturnType<typeof vi.fn>
  import: ReturnType<typeof vi.fn>
}

interface MockCollectionOps {
  retrieve: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  documents: ReturnType<typeof vi.fn>
}

interface MockCollectionsOps {
  create: ReturnType<typeof vi.fn>
}

export interface MockTypesenseClient {
  /** Call with name → specific collection ops; call without → create */
  collections: ReturnType<typeof vi.fn>
  health: { retrieve: ReturnType<typeof vi.fn> }
  /** Access mock internals for assertions */
  _mocks: {
    documentOps: MockDocumentOps
    collectionOps: MockCollectionOps
    collectionsOps: MockCollectionsOps
  }
}

export function createMockTypesenseClient(): MockTypesenseClient {
  const documentOps: MockDocumentOps = {
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    search: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
    import: vi.fn().mockResolvedValue([])
  }

  const collectionOps: MockCollectionOps = {
    retrieve: vi.fn().mockResolvedValue({ name: 'test', fields: [], num_documents: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    documents: vi.fn().mockImplementation((id?: string) => {
      if (id) {
        return { delete: documentOps.delete, update: documentOps.update }
      }
      return {
        upsert: documentOps.upsert,
        search: documentOps.search,
        import: documentOps.import,
        delete: documentOps.delete
      }
    })
  }

  const collectionsOps: MockCollectionsOps = {
    create: vi.fn().mockResolvedValue({})
  }

  const collections = vi.fn().mockImplementation((name?: string) => {
    if (name) return collectionOps
    return collectionsOps
  })

  return {
    collections,
    health: { retrieve: vi.fn().mockResolvedValue({ ok: true }) },
    _mocks: { documentOps, collectionOps, collectionsOps }
  }
}
