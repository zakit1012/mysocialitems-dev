import { IsIn, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  // bcrypt reads only the first 72 bytes.
  @MaxLength(72)
  newPassword: string;
}

/** A new password with the emailed code instead of the current one. */
export class ResetPasswordDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  /** Typed by the user, so a stray click cannot delete an account. */
  @IsIn(['DELETE'])
  confirm: string;
}
