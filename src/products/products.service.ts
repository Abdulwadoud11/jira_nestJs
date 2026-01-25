// src/products/products.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { JiraService } from '../jira/jira.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private repo: Repository<Product>,
    private jira: JiraService
  ) { }

  // 1. Create Product -> Create Jira Ticket
  async createProduct(name: string, description?: string, externalRef?: string) {
    const product = await this.repo.save({ name, description, externalRef, jiraSyncStatus: 'PENDING' });

    try {
      const jiraResult = await this.jira.createIssue({
        summary: product.name,
        description: product.description,
        productId: product.id
      });

      Object.assign(product, {
        jiraIssueKey: jiraResult.jiraKey,
        jiraIssueId: jiraResult.jiraId,
        jiraSyncStatus: 'OK',
        jiraLastSyncAt: new Date(),
      });

      const savedProduct = await this.repo.save(product);
      return this.filterProductResponse(savedProduct);
    } catch (e) {
      this.logger.error(`Failed to create Jira issue for product ${product.id}: ${e.message}`);
      Object.assign(product, { jiraSyncStatus: 'FAILED' });
      const savedProduct = await this.repo.save(product);
      return this.filterProductResponse(savedProduct);
    }
  }

  // 2. Update Product -> Update Jira Ticket
  async update(id: number, dto: UpdateProductDto) {
    const product = await this.repo.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    // Update product fields using Object.assign
    Object.assign(product, dto);
    await this.repo.save(product);

    // Sync to Jira
    if (product.jiraIssueKey) {
      try {
        await this.jira.updateIssue({
          issueKey: product.jiraIssueKey,
          summary: product.name,
          description: product.description
        });
        Object.assign(product, {
          jiraSyncStatus: 'OK',
          jiraLastSyncAt: new Date()
        });
        await this.repo.save(product);
      } catch (e) {
        this.logger.error(`Failed to update Jira issue ${product.jiraIssueKey}: ${e.message}`);
        Object.assign(product, { jiraSyncStatus: 'FAILED' });
        await this.repo.save(product);
      }
    } else {
      // Create Jira issue if missing
      try {
        const jiraResult = await this.jira.createIssue({
          summary: product.name,
          description: product.description,
          productId: product.id
        });
        Object.assign(product, {
          jiraIssueKey: jiraResult.jiraKey,
          jiraIssueId: jiraResult.jiraId,
          jiraSyncStatus: 'OK',
          jiraLastSyncAt: new Date(),
        });
        await this.repo.save(product);
      } catch (e) {
        this.logger.error(`Failed to create Jira issue for product ${product.id}: ${e.message}`);
        Object.assign(product, { jiraSyncStatus: 'FAILED' });
        await this.repo.save(product);
      }
    }

    return this.filterProductResponse(product);
  }

  // 3. Get Product + Current State
  async findProduct(id: number) {
    const product = await this.repo.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    if (!product.jiraIssueKey) {
      return this.filterProductWithTicket(product, null, 'NO_KEY');
    }

    try {
      const jiraData = await this.jira.getIssue(product.jiraIssueKey);
      return this.filterProductWithTicket(product, jiraData);
    } catch (e) {
      this.logger.error(`Failed to fetch Jira issue ${product.jiraIssueKey}: ${e.message}`);
      return this.filterProductWithTicket(product, null, 'FAILED', e.message);
    }
  }

  async handleJiraWebhook(payload: any) {
    // 1. Traceability: Basic ID and Event discovery
    const issue = payload.issue || payload; // Support both nested and flat payloads
    const issueKey = issue?.key;
    const fields = issue?.fields || {};
    
    if (!issueKey) {
      this.logger.error(`[WEBHOOK] Received payload without Issue Key`);
      return { received: true };
    }
  
    // 2. Find Product
    const product = await this.repo.findOneBy({ jiraIssueKey: issueKey });
    if (!product) {
      this.logger.warn(`[WEBHOOK]  Issue: ${issueKey} | Error: Product not found`);
      return { received: true }; 
    }
  
    // 3. Mapping Updates (Minimal & Traceable)
    const updates: Partial<Product> = {};
    const changelog: string[] = [];
  
    // Sync Name/Summary
    if (fields.summary && fields.summary !== product.name) {
      changelog.push(`Name: ${product.name} -> ${fields.summary}`);
      updates.name = fields.summary;
    }
  
    // Sync Status
    const newStatus = fields.status?.name;
    if (newStatus && newStatus !== product.ticketStatus) {
      changelog.push(`Status: ${product.ticketStatus || 'N/A'} -> ${newStatus}`);
      updates.ticketStatus = newStatus;
    }
  
    // Sync Description (v2 supports string directly)
    if (fields.description && fields.description !== product.description) {
      changelog.push(`Description updated (${fields.description.length} chars)`);
      updates.description = fields.description;
    }
  
    // 4. Traceability Logging & Save
    if (changelog.length > 0) {
      Object.assign(product, updates);
      product.jiraLastSyncAt = new Date();
      product.jiraSyncStatus = 'OK';
      
      await this.repo.save(product);

      this.logger.log(`[WEBHOOK]  Issue: ${issueKey} | Product ID: ${product.id}`);
    } else {
      this.logger.log(`[WEBHOOK]  Issue: ${issueKey} | No changes detected.`);
    }
  
    return { received: true };
  }

  // 5. Soft Delete -> Move Jira to "Dropped"
  async remove(id: number) {
    const product = await this.repo.findOneBy({ id });
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    // Transition Jira issue to "Dropped"
    if (product.jiraIssueKey) {
      try {
        await this.jira.updateStatus(product.jiraIssueKey);
        Object.assign(product, {
          jiraSyncStatus: 'OK',
          jiraLastSyncAt: new Date()
        });
        await this.repo.save(product);
      } catch (e) {
        this.logger.error(`Failed to transition Jira issue ${product.jiraIssueKey} to Dropped: ${e.message}`);
        Object.assign(product, { jiraSyncStatus: 'FAILED' });
        await this.repo.save(product);
        // Continue with soft delete even if Jira transition fails
      }
    }

    // Soft delete using TypeORM's softDelete
    await this.repo.softDelete(id);

    return {
      id,
      deleted: true,
      deletedAt: new Date(),
      jiraTransitioned: product.jiraIssueKey ? true : false,
      jiraSyncStatus: product.jiraSyncStatus,
    };
  }

  // ---  for Create/Update---
  private filterProductResponse(product: Product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      externalRef: product.externalRef,
      jiraIssueKey: product.jiraIssueKey,
      jiraIssueId: product.jiraIssueId,
    };
  }

   // ---  for get---
  private filterProductWithTicket(product: Product, ticket: any, jiraFetchStatus?: string, jiraFetchError?: string) {
    const base = {
      id: product.id,
      name: product.name,
      description: product.description,
      externalRef: product.externalRef,
      ticket: ticket ? {
        key: ticket.key,
        status: ticket.status,
        updated: ticket.updated,
        summary: ticket.summary,
      } : null,
    };

    if (jiraFetchStatus) {
      return { ...base, jiraFetchStatus, ...(jiraFetchError && { jiraFetchError }) };
    }

    return base;
  }
}