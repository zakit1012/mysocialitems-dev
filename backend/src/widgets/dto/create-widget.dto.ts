import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateWidgetDto {
  @IsString()
  @MinLength(3)
  placeId: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;

  @IsOptional()
  settings?: any;
}
