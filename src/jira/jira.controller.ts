import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { JiraService } from './jira.service';
import { CreateJiraDto } from './dto/create-jira.dto';
import { UpdateJiraDto } from './dto/update-jira.dto';
import { ProductsService } from 'src/products/products.service';

@Controller('jira')
export class JiraController {
  constructor(
    private readonly jiraService: JiraService,
    private readonly productsService: ProductsService
  ) { }
  @Post('webhook')
async handleWebhook(@Body() data: any) {
  // 1. Simple Extraction
  const issueKey = data.issue?.key;              // "PROJ-66"
  const issueName = data.issue?.fields?.summary;  // "my Product 1"
  const issueStatus = data.issue?.fields?.status?.name;

  // 2. Simple Traceability Logs
  console.log(`[Jira Webhook] Key: ${issueKey} | Name: ${issueName} | Status: ${issueStatus}`);

  // 3. Pass to Service
  return this.productsService.handleJiraWebhook(data);
}
}