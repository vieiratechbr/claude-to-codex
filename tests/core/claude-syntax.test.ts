import {expect,it} from 'vitest';
import {claudeSyntaxMarkers} from '../../src/core/adapters/skills';
it('não trata interpretador bash e argumentos de um script como APIs do Claude',()=>{
  expect(claudeSyntaxMarkers('Run the portable command:\n```bash\n#!/usr/bin/env bash\nprintf "%s" "$1"\n```')).toEqual([]);
});
it('continua detectando placeholders de invocação e APIs ativas em exemplos',()=>{
  expect(claudeSyntaxMarkers('Read $1 then use $ARGUMENTS.')).toEqual(expect.arrayContaining(['$1','$ARGUMENTS']));
  expect(claudeSyntaxMarkers('```json\n{"tool":"AskUserQuestion"}\n```')).toContain('AskUserQuestion');
});
it('detecta controles TaskCreate e TaskUpdate ainda não adaptados',()=>{
  expect(claudeSyntaxMarkers('Use TaskCreate then TaskUpdate.')).toEqual(expect.arrayContaining(['TaskCreate','TaskUpdate']));
});
it('não confunde valores monetários abreviados com argumentos posicionais',()=>{
 expect(claudeSyntaxMarkers('Revenue threshold $200K; royalty after $1M.')).toEqual([]);
 expect(claudeSyntaxMarkers('Read the explicit `$10` argument.')).toContain('$10');
});
it('preserves source product identity without treating it as a runtime API', () => {
  expect(claudeSyntaxMarkers('Source: Claude Code Game Studios. Keep its attribution.')).toEqual([]);
  expect(claudeSyntaxMarkers('Claude Code Game Studios requires Claude Code to run this hook.')).toContain('Claude Code');
  expect(claudeSyntaxMarkers('Claude Code Game Studios uses AskUserQuestion.')).toContain('AskUserQuestion');
});
