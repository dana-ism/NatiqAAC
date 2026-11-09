import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentStorageService } from './document-storage.service';
import { SpecialistService } from './specialist.service';
import {
  SpecialistController,
  SpecialistAdminController,
} from './specialist.controller';
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [DocumentStorageService, SpecialistService],
  controllers: [SpecialistController, SpecialistAdminController],
})
export class SpecialistModule {}
