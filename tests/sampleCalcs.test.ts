import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {sampleCalcs} from '../src/data/sampleCalcs';

// The Sample calcs tab links files served from public/: each must ship with the site, at the size the card states.
describe('sample calculations on the site',()=>{
 it('ships every listed PDF and cover image in public/',()=>{
  expect(sampleCalcs.length).toBeGreaterThan(0);
  for(const s of sampleCalcs){
   const pdf=path.join('public',s.file),cover=path.join('public',s.cover);
   expect(fs.existsSync(pdf),s.file).toBe(true);expect(fs.existsSync(cover),s.cover).toBe(true);
   expect(fs.statSync(pdf).size).toBe(s.bytes);
   const head=fs.readFileSync(pdf).subarray(0,5).toString('latin1');expect(head).toBe('%PDF-');
   // The page count the card states is the PDF's own.
   const pages=fs.readFileSync(pdf).toString('latin1').match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/);
   expect(pages,'page tree').not.toBeNull();expect(Number(pages![1])).toBe(s.pages);
  }
 });
});
