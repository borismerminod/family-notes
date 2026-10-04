import { TestBed } from '@angular/core/testing';
import { CategoriesService } from './categories.service';
import { Category } from '../models/category.model';
import { vi, expect, describe, it, beforeEach } from 'vitest';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let mockDb: any;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [CategoriesService],
    });
    service = TestBed.inject(CategoriesService);

    // Mocking the protected db and ready properties to avoid actual database initialization
    mockDb = {
      query: vi.fn().mockImplementation(async () => ({ values: [] })),
      run: vi.fn().mockImplementation(async () => ({})),
    };

    (service as any).db = mockDb;
    (service as any).ready = Promise.resolve();
    // Mock the persist method to prevent it from calling the real Capacitor plugin
    (service as any).persist = vi.fn().mockResolvedValue(undefined);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('create', () => {
    it('should store an empty colour when none is given', async () => {
      const category = await service.create('Sans couleur');

      const [, params] = mockDb.run.mock.calls[0];
      expect(params).toEqual([category.id, 'Sans couleur', '']);
      expect(category.color).toBe('');
    });

    it('should create a new category', async () => {
      const name = 'New Category';
      const color = '#FF5733';
      
      const category = await service.create(name, color);
      
      expect(category.name).toBe(name);
      expect(category.color).toBe(color);
      expect(category.id).toBeDefined();
      expect(mockDb.run).toHaveBeenCalled();
      expect((service as any).persist).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return an existing category when the name matches', async () => {
      const name = 'Exist';
      const categoryData = { id: 'cat-1', name, color: '#FF5733' };
      mockDb.query.mockImplementation(async () => ({ values: [categoryData] }));

      const category = await service.get(name);
      expect(category?.name).toBe(name);
    });

    it('should return undefined when the category does not exist', async () => {
      mockDb.query.mockImplementation(async () => ({ values: [] }));
      const category = await service.get('NonExistent');
      expect(category).toBeUndefined();
    });
  });

  describe('getOrCreate', () => {
    it('crée la catégorie avec la couleur choisie quand le nom est nouveau', async () => {
      mockDb.query.mockImplementation(async () => ({ values: [] }));

      const category = await service.getOrCreate('Jardin', '#34C759');

      expect(category.name).toBe('Jardin');
      expect(category.color).toBe('#34C759');
      const [sql, params] = mockDb.run.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('insert into categories');
      expect(params).toContain('#34C759');
    });

    it('met à jour la couleur d’une catégorie existante quand elle change', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'cat-1', name: 'Travail', color: '#007AFF' }],
      }));

      const category = await service.getOrCreate('Travail', '#FF9500');

      expect(category).toEqual({ id: 'cat-1', name: 'Travail', color: '#FF9500' });
      const [sql, params] = mockDb.run.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('update categories set color');
      expect(params).toEqual(['#FF9500', 'cat-1']);
    });

    it('n’écrit rien quand la couleur est identique, à la casse près', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'cat-1', name: 'Travail', color: '#FF9500' }],
      }));

      await service.getOrCreate('Travail', '#ff9500');

      expect(mockDb.run).not.toHaveBeenCalled();
      expect((service as any).persist).not.toHaveBeenCalled();
    });

    it('n’écrit rien quand aucune couleur n’est fournie', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'cat-1', name: 'Travail', color: '#007AFF' }],
      }));

      const category = await service.getOrCreate('Travail');

      expect(category.color).toBe('#007AFF');
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    it('ignore les espaces de bord du nom saisi', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'cat-1', name: 'Travail', color: '#007AFF' }],
      }));

      await service.getOrCreate('  Travail  ');

      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual(['Travail']);
    });
  });

  describe('CRUD operations', () => {
    it('should fetch all categories', async () => {
      const categories = [
        { id: '1', name: 'Cat 1', color: '#000' },
        { id: '2', name: 'Cat 2', color: '#fff' },
      ];
      mockDb.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM categories')) {
          return { values: categories };
        }
        return { values: [] };
      });

      const all = await service.getAllCategories();
      expect(all.length).toBe(2);
      expect(all[0].name).toBe('Cat 1');
    });

    it('should delete a category', async () => {
      await service.delete('1');
      expect(mockDb.run).toHaveBeenCalled();
      expect((service as any).persist).toHaveBeenCalled();
    });

    it('should update the color of a category', async () => {
      await service.setColor('1', '#FF0000');

      const [sql, params] = mockDb.run.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('update categories set color');
      expect(params).toEqual(['#FF0000', '1']);
      expect((service as any).persist).toHaveBeenCalled();
    });
  });
});
