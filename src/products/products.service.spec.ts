import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { JiraService } from '../jira/jira.service';
import { NotFoundException } from '@nestjs/common';


describe('ProductsService', () => {
  let service: ProductsService;
  let repo: jest.Mocked<Repository<Product>>;
  let jira: jest.Mocked<JiraService>;

  const mockRepo = () => ({
    save: jest.fn(),
    findOneBy: jest.fn(),
    softDelete: jest.fn(),
  });

  const mockJira = () => ({
    createIssue: jest.fn(),
    updateIssue: jest.fn(),
    getIssue: jest.fn(),
    updateStatus: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useFactory: mockRepo },
        { provide: JiraService, useFactory: mockJira },
      ],
    }).compile();

    service = module.get(ProductsService);
    repo = module.get(getRepositoryToken(Product));
    jira = module.get(JiraService);

    jest.spyOn(service['logger'], 'error').mockImplementation(() => { });

    jest.clearAllMocks();
  });


  describe('createProduct', () => {
    it('should create product and create Jira issue', async () => {
      const dto = {
        name: 'Product A',
        description: 'Desc',
        externalRef: 'EXT-1',
      };

      const savedProduct = {
        id: 1,
        ...dto,
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.save
        .mockResolvedValueOnce(savedProduct)
        .mockResolvedValueOnce({
          ...savedProduct,
          jiraIssueKey: 'PROJ-1',
          jiraIssueId: '1001',
          jiraSyncStatus: 'OK',
        } as Product);

      jira.createIssue.mockResolvedValue({
        jiraKey: 'PROJ-1',
        jiraId: '1001',
      });

      const result = await service.createProduct(dto);

      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(jira.createIssue).toHaveBeenCalledWith({
        summary: 'Product A',
        description: 'Desc',
        productId: 1,
      });

      expect(result).toEqual({
        id: 1,
        name: 'Product A',
        description: 'Desc',
        externalRef: 'EXT-1',
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '1001',
      });
    });
  });

  ///////////////////////////////////////////////////////////////

  describe('update', () => {
    it('should update product and Jira successfully', async () => {
      const product = {
        id: 1,
        name: 'Old Name',
        description: 'Old Desc',
        jiraIssueKey: 'PROJ-1',
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      repo.save.mockResolvedValue(product);
      jira.updateIssue.mockResolvedValue(undefined); // Jira update succeeds

      const dto = { name: 'New Name', description: 'New Desc' };
      const result = await service.update(1, dto);

      // repo.save called twice: first for local update, second after Jira update
      expect(repo.save).toHaveBeenCalledTimes(2);

      // Jira was called with updated fields
      expect(jira.updateIssue).toHaveBeenCalledWith({
        issueKey: 'PROJ-1',
        summary: 'New Name',
        description: 'New Desc',
      });

      // Response matches filterProductResponse
      expect(result).toEqual({
        id: 1,
        name: 'New Name',
        description: 'New Desc',
        externalRef: undefined,
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: undefined,
      });
    });

    it('should throw NotFoundException if product does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.update(1, { name: 'New' }))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should mark jiraSyncStatus as FAILED if Jira update fails', async () => {
      const product = {
        id: 1,
        name: 'Old Name',
        description: 'Old Desc',
        jiraIssueKey: 'PROJ-1',
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      repo.save.mockResolvedValue(product);
      jira.updateIssue.mockRejectedValue(new Error('Jira down')); // simulate Jira failure

      const dto = { name: 'New Name', description: 'New Desc' };
      await service.update(1, dto);

      // repo.save called to update jiraSyncStatus to FAILED
      expect(repo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ jiraSyncStatus: 'FAILED' })
      );
    });

    it('should create Jira issue if product has no jiraIssueKey', async () => {
      const product = {
        id: 1,
        name: 'Old Name',
        description: 'Old Desc',
        jiraSyncStatus: 'PENDING',
        jiraIssueKey: null,
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      repo.save.mockResolvedValue(product);
      jira.createIssue.mockResolvedValue({ jiraKey: 'PROJ-123', jiraId: '1001' });

      const dto = { name: 'Updated Name', description: 'Updated Desc' };
      const result = await service.update(1, dto);

      expect(jira.createIssue).toHaveBeenCalled();
      expect(result.jiraIssueKey).toBe('PROJ-123');
    });

  });

  ///////////////////////////////////////////////////////////////

  describe('findProduct', () => {

    it('should throw NotFoundException if product does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.findProduct(1))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should return product with jiraFetchStatus NO_KEY if jiraIssueKey is missing', async () => {
      const product = {
        id: 1,
        name: 'Product A',
        description: 'Desc',
        jiraIssueKey: null,
        externalRef: 'EXT-1',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);

      const result = await service.findProduct(1);

      expect(result).toEqual({
        id: 1,
        name: 'Product A',
        description: 'Desc',
        externalRef: 'EXT-1',
        ticket: null,
        jiraFetchStatus: 'NO_KEY',
      });
    });

    it('should return product with ticket info if Jira fetch succeeds', async () => {
      const product = {
        id: 1,
        name: 'Product A',
        description: 'Desc',
        jiraIssueKey: 'PROJ-1',
        externalRef: 'EXT-1',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      const jiraData = {
        key: 'PROJ-1',
        status: 'Open',
        updated: '2026-01-27T00:00:00Z',
        summary: 'Product A',
      };
      jira.getIssue.mockResolvedValue(jiraData);

      const result = await service.findProduct(1);

      expect(jira.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(result).toEqual({
        id: 1,
        name: 'Product A',
        description: 'Desc',
        externalRef: 'EXT-1',
        ticket: jiraData,
      });
    });

    it('should return product with jiraFetchStatus FAILED if Jira fetch fails', async () => {
      const product = {
        id: 1,
        name: 'Product A',
        description: 'Desc',
        jiraIssueKey: 'PROJ-1',
        externalRef: 'EXT-1',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      jira.getIssue.mockRejectedValue(new Error('Jira down'));

      const result = await service.findProduct(1);

      expect(jira.getIssue).toHaveBeenCalledWith('PROJ-1');
      expect(result).toEqual({
        id: 1,
        name: 'Product A',
        description: 'Desc',
        externalRef: 'EXT-1',
        ticket: null,
        jiraFetchStatus: 'FAILED',
        jiraFetchError: 'Jira down',
      });
    });

  });

  ///////////////////////////////////////////////////////////////

  describe('handleJiraWebhook', () => {

    it('should return received=true if payload has no issue key', async () => {
      const payload = { some: 'data' }; // no issue.key

      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      const result = await service.handleJiraWebhook(payload);

      expect(result).toEqual({ received: true });
      expect(logSpy).toHaveBeenCalledWith('[WEBHOOK] Received payload without Issue Key');

      logSpy.mockRestore();
    });

    it('should return received=true if product not found', async () => {
      const payload = { issue: { key: 'PROJ-1', fields: {} } };

      repo.findOneBy.mockResolvedValue(null);
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      const result = await service.handleJiraWebhook(payload);

      expect(result).toEqual({ received: true });
      expect(warnSpy).toHaveBeenCalledWith('[WEBHOOK]  Issue: PROJ-1 | Error: Product not found');

      warnSpy.mockRestore();
    });

    it('should update product and save if changes detected', async () => {
      const product = {
        id: 1,
        name: 'Old Name',
        description: 'Old Desc',
        ticketStatus: 'OPEN',
        jiraSyncStatus: 'PENDING',
      } as Product;

      const payload = {
        issue: {
          key: 'PROJ-1',
          fields: {
            summary: 'New Name',
            status: { name: 'CLOSED' },
            description: 'New Desc',
          },
        },
      };

      repo.findOneBy.mockResolvedValue(product);
      repo.save.mockResolvedValue(product);

      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      const result = await service.handleJiraWebhook(payload);

      expect(result).toEqual({ received: true });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Name',
        description: 'New Desc',
        ticketStatus: 'CLOSED',
        jiraSyncStatus: 'OK',
        jiraLastSyncAt: expect.any(Date),
      }));

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Changes:'));
      logSpy.mockRestore();
    });

    it('should log but not save if no changes detected', async () => {
      const product = {
        id: 1,
        name: 'Same Name',
        description: 'Same Desc',
        ticketStatus: 'OPEN',
        jiraSyncStatus: 'OK',
      } as Product;

      const payload = {
        issue: {
          key: 'PROJ-1',
          fields: {
            summary: 'Same Name',
            status: { name: 'OPEN' },
            description: 'Same Desc',
          },
        },
      };

      repo.findOneBy.mockResolvedValue(product);

      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      const result = await service.handleJiraWebhook(payload);

      expect(result).toEqual({ received: true });
      expect(repo.save).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No changes detected.'));
      logSpy.mockRestore();
    });

  });

  ///////////////////////////////////////////////////////////////

  describe('remove', () => {

    it('should throw NotFoundException if product does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(1))
        .rejects
        .toThrow(NotFoundException);
    });

    it('should remove product and transition Jira to dropped successfully', async () => {
      const product = {
        id: 1,
        jiraIssueKey: 'PROJ-1',
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      jira.updateStatus.mockResolvedValue(undefined);
      repo.save.mockResolvedValue(product);
      repo.softDelete.mockResolvedValue(undefined);

      const result = await service.remove(1);

      // Jira updated and product saved
      expect(jira.updateStatus).toHaveBeenCalledWith('PROJ-1');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        jiraSyncStatus: 'OK',
        jiraLastSyncAt: expect.any(Date),
      }));

      // Soft delete called
      expect(repo.softDelete).toHaveBeenCalledWith(1);

      // Response structure
      expect(result).toEqual(expect.objectContaining({
        id: 1,
        deleted: true,
        jiraTransitioned: true,
        jiraSyncStatus: 'OK',
        deletedAt: expect.any(Date),
      }));
    });

    it('should mark jiraSyncStatus FAILED if Jira transition fails but still soft deletes', async () => {
      const product = {
        id: 1,
        jiraIssueKey: 'PROJ-1',
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      jira.updateStatus.mockRejectedValue(new Error('Jira down'));
      repo.save.mockResolvedValue(product);
      repo.softDelete.mockResolvedValue(undefined);

      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      const result = await service.remove(1);

      // Jira failure logged
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to transition Jira issue PROJ-1'));

      // Soft delete still called
      expect(repo.softDelete).toHaveBeenCalledWith(1);

      // jiraSyncStatus should be FAILED
      expect(result.jiraSyncStatus).toBe('FAILED');

      logSpy.mockRestore();
    });

    it('should soft delete product without Jira key', async () => {
      const product = {
        id: 1,
        jiraIssueKey: null,
        jiraSyncStatus: 'PENDING',
      } as Product;

      repo.findOneBy.mockResolvedValue(product);
      repo.softDelete.mockResolvedValue(undefined);

      const result = await service.remove(1);

      expect(jira.updateStatus).not.toHaveBeenCalled();
      expect(repo.softDelete).toHaveBeenCalledWith(1);
      expect(result.jiraTransitioned).toBe(false);
      expect(result.jiraSyncStatus).toBe('PENDING');
    });

  });

  ///////////////////////////////////////////////////////////////

  describe('createJiraIssueForProduct', () => {

    it('should create Jira issue and update product', async () => {
      const product = {
        id: 1,
        name: 'Product A',
        description: 'Desc',
        jiraSyncStatus: 'PENDING',
      } as Product;

      jira.createIssue.mockResolvedValue({
        jiraKey: 'PROJ-1',
        jiraId: '1001',
      });
      repo.save.mockResolvedValue(product);

      await service['createJiraIssueForProduct'](product);

      expect(jira.createIssue).toHaveBeenCalledWith({
        summary: 'Product A',
        description: 'Desc',
        productId: 1,
      });

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '1001',
        jiraSyncStatus: 'OK',
        jiraLastSyncAt: expect.any(Date),
      }));
    });

    it('should set jiraSyncStatus FAILED if Jira creation fails', async () => {
      const product = {
        id: 1,
        name: 'Product A',
        description: 'Desc',
        jiraSyncStatus: 'PENDING',
      } as Product;

      jira.createIssue.mockRejectedValue(new Error('Jira down'));
      repo.save.mockResolvedValue(product);

      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      await service['createJiraIssueForProduct'](product);

      expect(jira.createIssue).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        jiraSyncStatus: 'FAILED',
      }));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create Jira issue for product 1'));

      logSpy.mockRestore();
    });

  });





});
