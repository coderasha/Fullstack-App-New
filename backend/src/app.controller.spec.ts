import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { RolesGuard } from './auth/roles.guard';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getHealth: jest.fn(() => ({ status: 'ok', service: 'attendance-api' })),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: appService,
        },
        {
          provide: AuthService,
          useValue: {},
        },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return service health', () => {
    expect(appController.getHealth()).toEqual({
      status: 'ok',
      service: 'attendance-api',
    });
  });
});
