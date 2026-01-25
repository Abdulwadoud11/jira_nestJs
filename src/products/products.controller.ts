import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  @Post()
  createProduct(@Body() createProductDto: CreateProductDto) {
    const { name, description } = createProductDto;

    return this.productsService.createProduct(
      name,
      description,
    );
  }

  @Patch(':id')
  updateProduct(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(String(id), updateProductDto);
  }


  @Get(':id')
  getProduct(@Param('id') id: string) {
    return this.productsService.findProduct(id);
  }


  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
