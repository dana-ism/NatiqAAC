import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RegisterDto } from './register.dto';

export class ParentRegistrationDto extends RegisterDto {
  @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
}
export class SpecialistRegistrationDto extends ParentRegistrationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  specialization: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  qualification: string;
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;
}
export class VerifyEmailDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token: string;
}
export class ResendVerificationDto {
  @IsString() @MaxLength(254) email: string;
  @IsOptional() @IsIn(['ar', 'en']) locale?: 'ar' | 'en';
}
export class ReviewApplicationDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;
}
