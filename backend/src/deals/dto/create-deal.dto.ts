import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';

const toNumber = (value: unknown) =>
  typeof value === 'string' ? Number(value) : value;
const toBoolean = (value: unknown) =>
  value === true || value === 'true' || value === '1';

export class CreateDealDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(20)
  description: string;

  @IsOptional()
  @IsString()
  highlights?: string;

  @IsUrl()
  imageUrl: string;

  @Transform(({ value }) => toNumber(value))
  @IsNumber()
  @Min(0)
  originalPrice: number;

  @Transform(({ value }) => toNumber(value))
  @IsNumber()
  @Min(0)
  dealPrice: number;

  @IsString()
  @MinLength(2)
  city: string;

  @IsString()
  @MinLength(2)
  location: string;

  @Transform(({ value }) => toNumber(value))
  @IsNumber()
  @Min(1)
  stock: number;

  @IsDateString()
  validUntil: string;

  @IsString()
  categoryId: string;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  featured?: boolean;
}
