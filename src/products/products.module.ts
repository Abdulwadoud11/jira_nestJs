import { forwardRef, Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { JiraModule } from '../jira/jira.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product]),
  forwardRef(() => JiraModule),],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],

})
export class ProductsModule { }
