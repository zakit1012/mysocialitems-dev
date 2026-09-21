import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PurchaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}
