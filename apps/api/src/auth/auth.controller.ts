import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ttlToMs } from '../common/crypto/tokens';
import { EnvService } from '../config/env.service';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

export const ACCESS_COOKIE = 'ap_access';
export const REFRESH_COOKIE = 'ap_refresh';

type TokenPair = { accessToken: string; refreshToken: string };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly env: EnvService,
  ) {}

  /**
   * Tokens também vão em cookies httpOnly: o frontend não precisa (nem deve)
   * guardar JWT em localStorage — mitiga roubo de sessão via XSS.
   */
  private setAuthCookies(res: Response, tokens: TokenPair) {
    const secure = this.env.nodeEnv === 'production';
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: ttlToMs(this.env.jwtAccessTtl),
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: ttlToMs(this.env.jwtRefreshTtl),
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  }

  @Post('register')
  @ApiOperation({ summary: 'Cadastro de profissional + tenant' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login do dashboard' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto);
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotaciona refresh token (body ou cookie)' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    const result = await this.auth.refresh(token);
    this.setAuthCookies(res, result);
    return result;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoga refresh token e limpa cookies' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (token) {
      await this.auth.logout(token);
    }
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Envia link de redefinição de senha por e-mail' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Redefine a senha com token de uso único' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil do profissional autenticado' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
