import { IsOptional } from 'class-validator';

export class UpdateWidgetDto {
  @IsOptional()
  settings?: any;
}
