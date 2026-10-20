import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  auditListSchema,
  displaySettingsSchema,
  changePasswordSchema,
  createStaffSchema,
  loginSchema,
  recoveryStatusSchema,
  resetPasswordSchema,
  sessionSchema,
  updateStaffSchema,
} from '@awesomejm/contracts';
import { AuthService, csrfToken } from './auth.service.js';
import {
  AllowPasswordChange,
  Public,
  RequirePermission,
  type AuthRequest,
  type CookieResponse,
} from './policy.js';
function parse<T>(
  schema: {
    safeParse(
      v: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  v: unknown,
): T {
  const parsed = schema.safeParse(v);
  if (!parsed.success)
    throw new BadRequestException(parsed.error.issues.map((i) => i.message));
  return parsed.data;
}
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Get('session') session(@Req() req: AuthRequest) {
    return sessionSchema.parse({
      user: req.user ?? null,
      csrfToken: req.sessionToken ? csrfToken(req.sessionToken) : null,
    });
  }
  @Public() @Post('login') @HttpCode(200) async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const v = parse(loginSchema, body);
    const result = await this.auth.login(
      v.username,
      v.password,
      req.socket.remoteAddress ?? 'unknown',
    );
    if (req.user && req.sessionToken)
      await this.auth.logout(req.user, req.sessionToken);
    this.auth.cookie(res, result.token);
    return sessionSchema.parse(result);
  }
  @AllowPasswordChange() @Post('logout') @HttpCode(200) async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    await this.auth.logout(req.user!, req.sessionToken!);
    this.auth.cookie(res, null);
    return { ok: true };
  }
  @AllowPasswordChange() @Post('password') @HttpCode(200) async password(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ) {
    const v = parse(changePasswordSchema, body);
    await this.auth.changePassword(req.user!, v.currentPassword, v.password);
    this.auth.cookie(res, null);
    return { ok: true };
  }
  @RequirePermission('settings.manage') @Patch('shop-settings') settings(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.auth.updateDisplaySettings(
      req.user!,
      parse(displaySettingsSchema, body),
    );
  }
  @RequirePermission('staff.manage') @Get('staff') staff() {
    return this.auth.staff();
  }
  @RequirePermission('staff.manage') @Post('staff') create(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.auth.create(req.user!, parse(createStaffSchema, body));
  }
  @RequirePermission('staff.manage') @Patch('staff/:id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.auth.update(req.user!, id, parse(updateStaffSchema, body));
  }
  @RequirePermission('staff.manage')
  @Post('staff/:id/reset-password')
  @HttpCode(200)
  async reset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    await this.auth.reset(
      req.user!,
      id,
      parse(resetPasswordSchema, body).password,
    );
    return { ok: true };
  }
  @RequirePermission('staff.manage')
  @Post('staff/:id/revoke-sessions')
  @HttpCode(200)
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    await this.auth.revoke(req.user!, id);
    return { ok: true };
  }
  @RequirePermission('staff.manage') @Get('audit') async audit(
    @Query('page') page = '1',
  ) {
    if (!/^[1-9][0-9]{0,5}$/.test(page))
      throw new BadRequestException('Invalid audit page.');
    return auditListSchema.parse(await this.auth.audit(Number(page)));
  }
  @RequirePermission('staff.manage') @Get('recovery') async recovery() {
    return recoveryStatusSchema.parse(await this.auth.recovery());
  }
}
