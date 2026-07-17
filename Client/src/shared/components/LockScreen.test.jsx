import React from 'react';
import { render, act } from '@testing-library/react';
import { LockScreenProvider, useLockScreen } from './LockScreen';

const mockLogout = jest.fn();
jest.mock('../../app/auth/AuthContext', () => ({
  useAuth: () => ({ user: { nombre: 'Test' }, logout: mockLogout }),
}));
jest.mock('../services/settingsService', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
}));

let rejectRefresh;
jest.mock('../services/axios-instance', () => ({
  __esModule: true,
  default: {
    post: jest.fn((url) =>
      url === '/auth/verify-pin'
        ? Promise.resolve({ data: { valid: true } })
        : Promise.resolve({ data: {} })
    ),
  },
  triggerTokenRefresh: jest.fn(
    () => new Promise((_resolve, reject) => { rejectRefresh = reject; })
  ),
}));

let unlockFn;
function TestHarness() {
  ({ unlock: unlockFn } = useLockScreen());
  return null;
}

beforeEach(() => {
  mockLogout.mockClear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  sessionStorage.setItem('dentiacore_locked', 'true'); // arranca bloqueado
});

test('un 401 tardío del chequeo de sesión no cierra la sesión si el usuario ya desbloqueó con PIN', async () => {
  await act(async () => {
    render(<LockScreenProvider><TestHarness /></LockScreenProvider>);
  });
  // El efecto de chequeo de sesión ya disparó triggerTokenRefresh() (pendiente).
  expect(rejectRefresh).toBeInstanceOf(Function);

  // Usuario desbloquea con PIN correcto ANTES de que resuelva el chequeo.
  await act(async () => {
    await unlockFn('1234');
  });

  // Ahora llega, tarde, el 401 del chequeo de sesión que quedó en vuelo.
  await act(async () => {
    rejectRefresh({ response: { status: 401 } });
    await Promise.resolve().then(() => Promise.resolve());
  });

  expect(mockLogout).not.toHaveBeenCalled();
});
