import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AvatarStorageService } from './avatar-storage.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminController, AdminProfileController],
  providers: [RolesGuard, AdminProfileService, AvatarStorageService],
})
export class AdminModule {}
