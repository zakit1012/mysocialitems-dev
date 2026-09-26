import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  // bcrypt reads only the first 72 bytes; longer is just work for nothing.
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  // Only customer accounts can be opened here. MERCHANT belonged to the old
  // deals app: anyone choosing it could publish public deal pages.
  @IsOptional()
  @IsIn(['USER'])
  role?: 'USER';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}
