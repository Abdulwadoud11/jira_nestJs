import { IsString, IsOptional } from "class-validator";

export class CreateProductDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    externalRef?: string;
}
