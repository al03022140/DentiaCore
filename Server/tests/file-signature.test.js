/**
 * Firma binaria de uploads (fase de endurecimiento — QW4).
 * Suite PURA de fs: no necesita Mongo ni levantar la app.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { matchesDeclaredMime, isJpegOrPng } = require('../utils/fileSignature');

const tmp = (name, buf) => {
  const p = path.join(os.tmpdir(), `sig-test-${Date.now()}-${name}`);
  fs.writeFileSync(p, buf);
  return p;
};

const HEADS = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  gif: Buffer.from('GIF89a\x01\x00', 'latin1'),
  webp: Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'latin1')]),
  pdf: Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1'),
  html: Buffer.from('<!DOCTYPE html><script>alert(1)</script>'),
  exe: Buffer.from([0x4d, 0x5a, 0x90, 0x00])
};

const created = [];
const make = (name, buf) => { const p = tmp(name, buf); created.push(p); return p; };
afterAll(() => created.forEach(p => { try { fs.unlinkSync(p); } catch (_e) { /* noop */ } }));

describe('matchesDeclaredMime', () => {
  test('acepta cada formato real con su mimetype declarado', () => {
    expect(matchesDeclaredMime(make('a.jpg', HEADS.jpeg), 'image/jpeg')).toBe(true);
    expect(matchesDeclaredMime(make('a.png', HEADS.png), 'image/png')).toBe(true);
    expect(matchesDeclaredMime(make('a.gif', HEADS.gif), 'image/gif')).toBe(true);
    expect(matchesDeclaredMime(make('a.webp', HEADS.webp), 'image/webp')).toBe(true);
    expect(matchesDeclaredMime(make('a.pdf', HEADS.pdf), 'application/pdf')).toBe(true);
  });

  test('rechaza contenido que no corresponde al mimetype declarado', () => {
    // HTML/executable disfrazados — el vector que motivó el middleware
    expect(matchesDeclaredMime(make('b.png', HEADS.html), 'image/png')).toBe(false);
    expect(matchesDeclaredMime(make('b.pdf', HEADS.exe), 'application/pdf')).toBe(false);
    // Formato real pero mimetype cruzado
    expect(matchesDeclaredMime(make('c.png', HEADS.jpeg), 'image/png')).toBe(false);
    expect(matchesDeclaredMime(make('c.pdf', HEADS.png), 'application/pdf')).toBe(false);
  });

  test('mimetype desconocido o archivo ilegible → false (fail closed)', () => {
    expect(matchesDeclaredMime(make('d.bin', HEADS.png), 'application/octet-stream')).toBe(false);
    expect(matchesDeclaredMime(path.join(os.tmpdir(), 'no-existe-xyz'), 'image/png')).toBe(false);
    expect(matchesDeclaredMime(make('vacio', Buffer.alloc(0)), 'image/png')).toBe(false);
  });
});

describe('isJpegOrPng (compatibilidad foto de perfil)', () => {
  test('true para JPEG y PNG, false para otros', () => {
    expect(isJpegOrPng(make('e.jpg', HEADS.jpeg))).toBe(true);
    expect(isJpegOrPng(make('e.png', HEADS.png))).toBe(true);
    expect(isJpegOrPng(make('e.gif', HEADS.gif))).toBe(false);
    expect(isJpegOrPng(make('e.html', HEADS.html))).toBe(false);
  });
});
