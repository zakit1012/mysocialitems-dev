import { IsString, Matches } from 'class-validator';

export class TotpCodeDto {
  @IsString()
  @Matches(/^\s*\d{6}\s*$/, {
    message: 'Enter the 6-digit code from your app.',
  })
  code: string;
}
