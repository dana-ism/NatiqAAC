import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  @Get('overview')
  overview(@Req() request: { user: { email: string; role: 'ADMIN' } }) {
    // Explicit safe projection: no identifiers, children, counts or secrets.
    return { account: { email: request.user.email, role: request.user.role } };
  }
}
