// src/products/products.service.ts
import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';
import { JiraService } from '../jira/jira.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly jiraService: JiraService,
  ) { }

  async createProduct(
    name: string,
    description: string,
  ): Promise<Product> {
    // create product in db
    const product = this.productRepo.create({
      name,
      description,
    });

    const savedProduct = await this.productRepo.save(product);

    try {
      const jiraTicket = await this.jiraService.createIssue({
        summary: name,
        description,
        productId: savedProduct.id,
      });

      savedProduct.jiraIssueKey = jiraTicket.jiraKey;
      savedProduct.jiraIssueId = jiraTicket.jiraId;
      savedProduct.ticketStatus = "TO DO";
      savedProduct.jiraSyncStatus = 'OK';
      savedProduct.jiraLastSyncAt = new Date();

      await this.productRepo.save(savedProduct);
    } catch (error) {
      this.logger.error('Jira sync failed', error);
      // if jira issue creation failed we save the product in db with jiraSyncStatus "FAILED"
      savedProduct.jiraSyncStatus = 'FAILED';
      savedProduct.jiraLastSyncAt = new Date();
      await this.productRepo.save(savedProduct);
    }

    return savedProduct;
  }

  async update(
    id: string,
    dataToUpdate,
  ): Promise<Product> {

    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');


    let updatedProduct;
    // Update Jira if linked
    if (product.jiraIssueKey) {

      // Update local fields
      Object.assign(product, dataToUpdate);
      updatedProduct = await this.productRepo.save(product);

      try {
        await this.jiraService.updateIssue({
          issueKey: product.jiraIssueKey,
          summary: product.name,
          description: product.description || '',
        });

        product.jiraSyncStatus = 'OK';
        product.jiraLastSyncAt = new Date();
        await this.productRepo.save(product);

      } catch (err) {
        product.jiraSyncStatus = 'FAILED';
        product.jiraLastSyncAt = new Date();
        await this.productRepo.save(product);

        throw new BadGatewayException(err.response)
      }
    } else {
      throw new BadRequestException(`Product ${id} has no linked Jira issue.`);

    }

    return updatedProduct;
  }

  async handleJiraWebhook(payload) {
    const fields = payload;
    console.log(fields);

    const updateData: Partial<Product> = {};
    if (fields.summary) updateData.name = fields.summary;
    if (fields.description) updateData.description = fields.description;
    if (fields.status) updateData.ticketStatus = fields.status;
    updateData.jiraLastSyncAt = new Date()
    updateData.jiraSyncStatus = "OK"

    const product = await this.updateByJiraKey(fields.issueKey, updateData);

    console.log(`product ${product.id} updated successfully`);

    return {
      status: 'success',
      productId: product.id,
    };
  }


  async updateByJiraKey(jiraKey: string, updateData: Partial<Product>) {
    const product = await this.productRepo.findOne({ where: { jiraIssueKey: jiraKey } });
    if (!product) {
      throw new NotFoundException(`No product found for Jira issue ${jiraKey}`);
    }

    Object.assign(product, updateData);
    return this.productRepo.save(product);
  }


  /**
   * Get product
   */

  async findProduct(id: string): Promise<any> {
    const product = await this.productRepo.findOneBy({ id });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`)
    }

    let issueObj: {
      key: string;
      status: string;
      summary: string;
    } | null = null;

    let jiraError;

    if (!product.jiraIssueKey) {
      return {
        product,
        error: 'No Jira issue linked to product',
      };
    }

    const issue = await this.jiraService.getIssue(product.jiraIssueKey);

    issueObj = {
      key: issue.key,
      status: issue.fields.status.statusCategory.name,
      summary: issue.fields.summary,
    };
    jiraError = 'Failed to fetch Issue from Jira ';


    return { product, issueObj, jiraError };

  }


  /**
   * Soft-delete a product
   */
  async remove(id: string): Promise<any> {
    const product = await this.productRepo.findOneBy({ id })
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`)
    }
    if (!product.jiraIssueKey) {
      throw new BadRequestException("No Jira issue linked to product")
    }


    // status Id => 3 = dropped, 11 = To Do, 21 = In Progress, 31 = In Review , 41 = Done
    // will throw err if failed
    await this.jiraService.updateStatus(product.jiraIssueKey, "3");

    //Soft Delete => deletedAt = new Date()
    await this.productRepo.softDelete(id);


    product.jiraLastSyncAt = new Date()
    product.jiraSyncStatus = "OK"

    await this.productRepo.save(product)

    return { msg: `product deleted succesfuly` }


  }

}
