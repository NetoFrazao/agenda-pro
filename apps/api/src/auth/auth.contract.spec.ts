/**
 * Contrato mínimo de API (auth) — substituto honesto enquanto Playwright UI não existe.
 * Valida o shape/regras do LoginDto (mesmo contrato que ValidationPipe aplica no controller).
 */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './dto/auth.dto';

describe('API contract — auth DTOs', () => {
  it('LoginDto rejeita email inválido e senha curta', async () => {
    const dto = plainToInstance(LoginDto, { email: 'nao-email', password: '123' });
    const errors = await validate(dto);
    const fields = errors.map((e) => e.property);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('LoginDto aceita payload válido com tenantSlug kebab-case', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'maria@studio.com',
      password: 'SenhaForte123!',
      tenantSlug: 'studio-maria',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('LoginDto rejeita tenantSlug inválido', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'maria@studio.com',
      password: 'SenhaForte123!',
      tenantSlug: 'Studio Maria',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tenantSlug')).toBe(true);
  });

  it('RegisterDto exige businessName e senha >= 8', async () => {
    const dto = plainToInstance(RegisterDto, {
      name: 'A',
      email: 'a@b.com',
      password: 'curta',
      businessName: '',
    });
    const errors = await validate(dto);
    const fields = errors.map((e) => e.property);
    expect(fields).toEqual(expect.arrayContaining(['name', 'password', 'businessName']));
  });
});
