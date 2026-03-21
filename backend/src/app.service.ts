import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import type { AuthenticatedUser, Role } from './auth/auth.types';
import { PrismaService } from './prisma/prisma.service';

const OFFICE_LATITUDE = 22.571591940015402;
const OFFICE_LONGITUDE = 88.43516749681649;
const OFFICE_RADIUS_METRES = 200;

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private readonly userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    phone: true,
    department: true,
    jobTitle: true,
    locationNote: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async getHealth() {
    return {
      status: 'ok',
      service: 'attendance-api',
    };
  }

  async signUp(input: SignUpInput) {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('Name is required.');
    }

    const normalizedEmail = this.normalizeEmail(input.email);
    this.validatePassword(input.password);
    this.validateRole(input.role);

    const prisma = this.prisma as any;
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new BadRequestException('Email is already registered.');
    }

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash: this.authService.hashPassword(input.password),
        role: input.role,
        phone: this.cleanOptional(input.phone),
        department: this.cleanOptional(input.department),
        jobTitle: this.cleanOptional(input.jobTitle),
        locationNote: this.cleanOptional(input.locationNote),
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(input: LoginInput) {
    const normalizedEmail = this.normalizeEmail(input.email);
    const prisma = this.prisma as any;
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !this.authService.verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(user);
  }

  async getCurrentUser(user: AuthenticatedUser) {
    const record = await this.getUserRecordById(user.sub);
    return this.toUserView(record);
  }

  async updateOwnProfile(user: AuthenticatedUser, input: UpdateProfileInput) {
    const record = await this.getUserRecordById(user.sub);
    const nextName = this.cleanOptional(input.name);
    const prisma = this.prisma as any;

    const updatedUser = await prisma.user.update({
      where: { id: record.id },
      data: {
        name: nextName ?? record.name,
        phone: this.cleanOptional(input.phone),
        department: this.cleanOptional(input.department),
        jobTitle: this.cleanOptional(input.jobTitle),
        locationNote: this.cleanOptional(input.locationNote),
      },
    });

    return this.toUserView(updatedUser);
  }

  async markAttendance(user: AuthenticatedUser, input: MarkAttendanceInput) {
    this.validateCoordinates(input.latitude, input.longitude);
    this.assertWithinOfficeGeofence(input.latitude, input.longitude);

    if (input.action === 'LOGIN') {
      return this.markLoginAttendance(user.sub, input);
    }

    if (input.action === 'LOGOUT') {
      return this.markLogoutAttendance(user.sub, input);
    }

    throw new BadRequestException('Attendance action must be LOGIN or LOGOUT.');
  }

  async getOwnAttendance(user: AuthenticatedUser) {
    const prisma = this.prisma as any;

    return prisma.attendance.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllAttendance() {
    const prisma = this.prisma as any;

    return prisma.attendance.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: this.userSelect,
        },
      },
    });
  }

  async getAllWorkers() {
    const prisma = this.prisma as any;

    return prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: this.userSelect,
    });
  }

  async getWorker(userId: string) {
    const prisma = this.prisma as any;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException('Worker not found.');
    }

    return user;
  }

  private async markLoginAttendance(userId: string, input: MarkAttendanceInput) {
    const prisma = this.prisma as any;
    const activeAttendance = await prisma.attendance.findFirst({
      where: { userId, logoutAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (activeAttendance) {
      throw new BadRequestException('Login attendance is already active. Mark logout attendance first.');
    }

    return prisma.attendance.create({
      data: {
        userId,
        latitude: input.latitude,
        longitude: input.longitude,
        address: this.cleanOptional(input.address),
      },
    });
  }

  private async markLogoutAttendance(userId: string, input: MarkAttendanceInput) {
    const prisma = this.prisma as any;
    const activeAttendance = await prisma.attendance.findFirst({
      where: { userId, logoutAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeAttendance) {
      throw new BadRequestException('No active login attendance found. Mark login attendance first.');
    }

    return prisma.attendance.update({
      where: { id: activeAttendance.id },
      data: {
        logoutLatitude: input.latitude,
        logoutLongitude: input.longitude,
        logoutAddress: this.cleanOptional(input.address),
        logoutAt: new Date(),
      },
    });
  }

  private async getUserRecordById(userId: string) {
    const prisma = this.prisma as any;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    return user as UserRecord;
  }

  private normalizeEmail(email: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required.');
    }

    return normalizedEmail;
  }

  private validatePassword(password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
  }

  private validateRole(role: Role) {
    if (role !== 'WORKER' && role !== 'SUPERVISOR') {
      throw new BadRequestException('Role must be WORKER or SUPERVISOR.');
    }
  }

  private assertWithinOfficeGeofence(latitude: number, longitude: number) {
    const distance = this.calculateDistanceInMetres(
      latitude,
      longitude,
      OFFICE_LATITUDE,
      OFFICE_LONGITUDE,
    );

    if (distance > OFFICE_RADIUS_METRES) {
      throw new BadRequestException('It is more than 200 metres away from office. Attendance cannot be marked.');
    }
  }

  private calculateDistanceInMetres(
    startLatitude: number,
    startLongitude: number,
    endLatitude: number,
    endLongitude: number,
  ) {
    const earthRadius = 6371000;
    const startLatRadians = this.toRadians(startLatitude);
    const endLatRadians = this.toRadians(endLatitude);
    const latitudeDelta = this.toRadians(endLatitude - startLatitude);
    const longitudeDelta = this.toRadians(endLongitude - startLongitude);

    const a =
      Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
      Math.cos(startLatRadians) * Math.cos(endLatRadians) *
        Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private validateCoordinates(latitude: number, longitude: number) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('Latitude is invalid.');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Longitude is invalid.');
    }
  }

  private cleanOptional(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private buildAuthResponse(user: UserRecord) {
    return {
      ...this.authService.signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      }),
      user: this.toUserView(user),
    };
  }

  private toUserView(user: UserViewable) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      department: user.department,
      jobTitle: user.jobTitle,
      locationNote: user.locationNote,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

type SignUpInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
  department?: string;
  jobTitle?: string;
  locationNote?: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type UpdateProfileInput = {
  name?: string;
  phone?: string;
  department?: string;
  jobTitle?: string;
  locationNote?: string;
};

type MarkAttendanceInput = {
  action: AttendanceAction;
  latitude: number;
  longitude: number;
  address?: string;
};

type AttendanceAction = 'LOGIN' | 'LOGOUT';

type UserViewable = {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  locationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserRecord = UserViewable & {
  passwordHash: string;
};
