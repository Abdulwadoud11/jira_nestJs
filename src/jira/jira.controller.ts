import { Controller, Get, Post, Body, Patch, Param, Delete, Logger } from '@nestjs/common';
import { JiraService } from './jira.service';
import { CreateJiraDto } from './dto/create-jira.dto';
import { UpdateJiraDto } from './dto/update-jira.dto';
import { ProductsService } from 'src/products/products.service';

@Controller('jira')
export class JiraController {
  private readonly logger = new Logger(JiraController.name);

  constructor(
    private readonly jiraService: JiraService,
    private readonly productsService: ProductsService
  ) { }

  @Post('webhook')
  async handleWebhook(@Body() data: any) {
    // Log raw payload for POC traceability
    // this.logger.log(`[WEBHOOK] Received payload: ${JSON.stringify(data)}`);

    return this.productsService.handleJiraWebhook(data);
  }
}