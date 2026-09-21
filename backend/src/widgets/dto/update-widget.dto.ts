import { IsObject, IsOptional } from 'class-validator';

export class UpdateWidgetDto {
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
