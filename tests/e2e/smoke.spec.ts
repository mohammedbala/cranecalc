import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

const watch=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());return errors;};

test('calculates the default project live in the browser',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Inputs & checks'})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('Geometry & member design',{exact:true})).toBeVisible();
 // The worker finishes a first calculation: the vertical deflection check appears in the worksheet.
 await expect(page.getByText('Vertical crane-load deflection').first()).toBeAttached({timeout:120000});
 await expect(page.getByLabel('Span arrangement')).toHaveValue('simple');
 // A worksheet without horizontal page scroll at phone width.
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(errors).toEqual([]);
});

test('runs the demonstration package: checks, drawing set and printable report',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Load demonstration'}).first().click();
 const generate=page.getByRole('button',{name:'Generate output',exact:true});
 await expect(generate).toBeEnabled({timeout:540000});

 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 await expect(tabs.filter({hasText:'S-07'})).toHaveCount(1,{timeout:120000});
 await tabs.filter({hasText:'S-01'}).first().click();
 await expect(page.locator('.drafting-linework svg')).toHaveAttribute('aria-label',/^S-01/);

 await generate.click();
 const dialog=page.getByRole('dialog',{name:'Generated output'});
 await expect(dialog).toBeVisible({timeout:120000});
 await expect(dialog.getByRole('button',{name:/Open report/})).toBeVisible();
 const set=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download drawing set (.dxf)'}).click();
 const dxf=await fs.readFile((await (await set).path())!,'utf8');
 expect(dxf).toContain('ENTITIES');expect(dxf).toContain('$INSUNITS');
 const report=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download printable report (.html)'}).click();
 const html=await fs.readFile((await (await report).path())!,'utf8');
 expect(html).toContain('counter(pages)');expect(html).toContain('NOT SEALED');
 expect(errors).toEqual([]);
});
