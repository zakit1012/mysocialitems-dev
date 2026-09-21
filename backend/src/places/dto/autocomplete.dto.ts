import { IsOptional, IsString, MinLength } from 'class-validator';

export class AutocompleteDto {
  @IsString()
  @MinLength(2)
  q: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;
}
