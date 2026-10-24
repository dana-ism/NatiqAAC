
import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hash(registerDto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: registerDto.fullName,
        email: registerDto.email,
        passwordHash,
        role: 'PARENT',
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      message: 'Account registered successfully',
      user,
    };
  }
}
