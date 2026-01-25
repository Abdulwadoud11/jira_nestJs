import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JiraService } from './jira.service';
import { JiraController } from './jira.controller';
import { ProductsModule } from 'src/products/products.module';

@Module({
  imports: [
    HttpModule,
    forwardRef(() => ProductsModule)
  ],
  controllers: [JiraController],
  providers: [JiraService],
  exports: [JiraService],
})
export class JiraModule { }
