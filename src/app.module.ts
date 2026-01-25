import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JiraModule } from './jira/jira.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'root',
      password: 'root',
      database: 'nest_app',
      autoLoadEntities: true,
      synchronize: true,
    }),
    JiraModule,
    ProductsModule
  ],
  controllers: [AppController],
  providers: [AppService],

})
export class AppModule { }
