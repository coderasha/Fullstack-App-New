import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './auth/current-user.decorator';
import { AuthGuard } from './auth/auth.guard';
import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import type { AuthenticatedUser, Role } from './auth/auth.types';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth() {
    return this.appService.getHealth();
  }

  @Post('auth/signup')
  signUp(
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role: Role;
      phone?: string;
      department?: string;
      jobTitle?: string;
      locationNote?: string;
    },
  ) {
    return this.appService.signUp(body);
  }

  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.appService.login(body);
  }

  @UseGuards(AuthGuard)
  @Get('auth/me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.appService.getCurrentUser(user);
  }

  @UseGuards(AuthGuard)
  @Patch('profile/me')
  updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      name?: string;
      phone?: string;
      department?: string;
      jobTitle?: string;
      locationNote?: string;
    },
  ) {
    return this.appService.updateOwnProfile(user, body);
  }

  @UseGuards(AuthGuard)
  @Get('attendance/me')
  getOwnAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.appService.getOwnAttendance(user);
  }

  @UseGuards(AuthGuard)
  @Post('attendance/mark')
  markAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      action: AttendanceAction;
      latitude: number;
      longitude: number;
      address?: string;
    },
  ) {
    return this.appService.markAttendance(user, body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPERVISOR')
  @Get('supervisor/users')
  getAllWorkers() {
    return this.appService.getAllWorkers();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPERVISOR')
  @Get('supervisor/users/:userId')
  getWorker(@Param('userId') userId: string) {
    return this.appService.getWorker(userId);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('SUPERVISOR')
  @Get('supervisor/attendance')
  getAllAttendance() {
    return this.appService.getAllAttendance();
  }
}

type AttendanceAction = 'LOGIN' | 'LOGOUT';
