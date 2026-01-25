import { forwardRef, Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraController } from './jira.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from 'src/products/products.module';

@Module({
  imports: [
    forwardRef(() => ProductsModule)
  ],
  controllers: [JiraController],
  providers: [JiraService],
  exports: [JiraService],

})
export class JiraModule { }
