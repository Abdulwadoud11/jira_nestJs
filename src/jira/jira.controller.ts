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
  async handleWebhook(@Body() data) {
    return this.productsService.handleJiraWebhook(data);
  }


}



// @Controller('jira')
// export class JiraController {
//   constructor(private readonly jiraService: JiraService) {}

//   @Post()
//   create(@Body() createJiraDto: CreateJiraDto) {
//     return this.jiraService.create(createJiraDto);
//   }

//   @Get()
//   findAll() {
//     return this.jiraService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.jiraService.findOne(+id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() updateJiraDto: UpdateJiraDto) {
//     return this.jiraService.update(+id, updateJiraDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.jiraService.remove(+id);
//   }
// }
