import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, UserStatus, AuthProvider } from './entities/user.entity';

export interface CreateUserData {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role?: UserRole;
  phone?: string;
  authProvider?: AuthProvider;
  googleId?: string;
  emailVerified?: boolean;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  status?: UserStatus;
  role?: UserRole;
  preferences?: User['preferences'];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(data: CreateUserData): Promise<User> {
    // Check if user already exists in this tenant
    const existingUser = await this.userRepository.findOne({
      where: { email: data.email.toLowerCase(), tenantId: data.tenantId },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const user = this.userRepository.create({
      email: data.email.toLowerCase(),
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      tenantId: data.tenantId,
      role: data.role || UserRole.MEMBER,
      phone: data.phone,
      authProvider: data.authProvider || AuthProvider.LOCAL,
      googleId: data.googleId,
      emailVerified: data.emailVerified || false,
      status: UserStatus.ACTIVE,
      preferences: {
        emailNotifications: true,
        smsNotifications: false,
        theme: 'system',
        language: 'en',
        timezone: 'UTC',
      },
    });

    return this.userRepository.save(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['tenant'],
    });
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    const whereClause: Record<string, unknown> = { email: email.toLowerCase() };
    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    return this.userRepository.findOne({
      where: whereClause,
      relations: ['tenant'],
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { googleId },
      relations: ['tenant'],
    });
  }

  async findByTenant(tenantId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, data);
    return this.userRepository.save(user);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.password = newPassword; // Will be hashed by @BeforeUpdate hook
    user.passwordChangedAt = new Date();
    await this.userRepository.save(user);
  }

  async updateRefreshToken(id: string, refreshTokenHash: string | null): Promise<void> {
    await this.userRepository.update(id, { refreshTokenHash });
  }

  async updateLastLogin(id: string, ip?: string): Promise<void> {
    await this.userRepository.update(id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  async incrementFailedLoginAttempts(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.failedLoginAttempts += 1;

    // Lock account after 5 failed attempts
    if (user.failedLoginAttempts >= 5) {
      const lockDuration = 15 * 60 * 1000; // 15 minutes
      user.lockedUntil = new Date(Date.now() + lockDuration);
    }

    return this.userRepository.save(user);
  }

  async verifyEmail(id: string): Promise<void> {
    await this.userRepository.update(id, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
      status: UserStatus.ACTIVE,
    });
  }

  async validateCredentials(email: string, password: string, tenantId?: string): Promise<User | null> {
    const user = await this.findByEmail(email, tenantId);

    if (!user) {
      return null;
    }

    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new BadRequestException(
        `This account uses ${user.authProvider} authentication. Please sign in with ${user.authProvider}.`,
      );
    }

    if (user.isLocked()) {
      throw new BadRequestException(
        'Account is locked due to too many failed login attempts. Please try again later.',
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Account is not active. Please contact support.');
    }

    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      await this.incrementFailedLoginAttempts(user.id);
      return null;
    }

    return user;
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.softDelete(id);
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.userRepository.count({ where: { tenantId } });
  }
}
