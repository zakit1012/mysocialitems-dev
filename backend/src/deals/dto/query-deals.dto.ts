import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

const toNumber = (value: unknown) =>
  typeof value === 'string' ? Number(value) : value;

export class QueryDealsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  featured?: string;

  @IsOptional()
  @Transform(({ value }) => toNumber(value))
  skip?: number;

  @IsOptional()
  @Transform(({ value }) => toNumber(value))
  take?: number;
}
