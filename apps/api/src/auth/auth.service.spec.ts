import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { DB } from '../database/database.module';

describe('AuthService', () => {
  let service: AuthService;
  let db: { query: { users: { findFirst: jest.Mock } }; insert: jest.Mock };
  let jwt: { sign: jest.Mock };

  beforeEach(async () => {
    db = {
      query: { users: { findFirst: jest.fn() } },
      insert: jest.fn(),
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DB, useValue: db },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when email is already taken', async () => {
      db.query.users.findFirst.mockResolvedValue({ id: '1', email: 'taken@test.com' });

      await expect(
        service.register({ email: 'taken@test.com', password: 'secret12' }),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes the password and returns an access token', async () => {
      db.query.users.findFirst.mockResolvedValue(null);
      db.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            { id: 'uuid-1', email: 'new@test.com', name: null },
          ]),
        }),
      });

      const result = await service.register({ email: 'new@test.com', password: 'secret12' });

      expect(result).toEqual({ access_token: 'signed.token' });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'uuid-1', email: 'new@test.com' });
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user is not found', async () => {
      db.query.users.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@test.com', password: 'secret12' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password is wrong', async () => {
      const hash = await bcrypt.hash('correct', 10);
      db.query.users.findFirst.mockResolvedValue({
        id: '1',
        email: 'user@test.com',
        passwordHash: hash,
      });

      await expect(
        service.login({ email: 'user@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns an access token with valid credentials', async () => {
      const hash = await bcrypt.hash('secret12', 10);
      db.query.users.findFirst.mockResolvedValue({
        id: '2',
        email: 'user@test.com',
        passwordHash: hash,
      });

      const result = await service.login({ email: 'user@test.com', password: 'secret12' });

      expect(result).toEqual({ access_token: 'signed.token' });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: '2', email: 'user@test.com' });
    });
  });
});
