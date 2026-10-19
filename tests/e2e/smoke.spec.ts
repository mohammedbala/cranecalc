import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

const watch=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());return errors;};

test('calculates the default project live in the browser',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 // A first visit opens on the templates; the default project calculates behind them.
 await expect(page.getByRole('button',{name:'Templates'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
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
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Load demonstration'}).first().click();
 const generate=page.getByRole('button',{name:'Generate output',exact:true});
 await expect(generate).toBeEnabled({timeout:540000});

 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 // The rolled demonstration's details fit one detail sheet, the last of the set.
 await expect(tabs.filter({hasText:'S-02'})).toHaveCount(1,{timeout:120000});
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

test('designs new freestanding columns with base plates and footings',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Load new-column example'}).first().click();
 await expect(page.getByRole('button',{name:'Generate output',exact:true})).toBeEnabled({timeout:540000});
 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 // The new columns and footings are on S-04; the longitudinal bracing (with the torsion brace) on S-05, the last sheet.
 await expect(tabs.filter({hasText:'S-05'})).toHaveCount(1,{timeout:120000});
 await tabs.filter({hasText:'S-04'}).first().click();
 await expect(page.locator('.drafting-linework svg')).toHaveAttribute('aria-label',/^S-04/);
 await expect(page.locator('.drafting-linework svg')).toContainText('FOOTING / SECTION');
 await tabs.filter({hasText:'S-05'}).first().click();
 await expect(page.locator('.drafting-linework svg')).toHaveAttribute('aria-label',/^S-05/);
 await expect(page.locator('.drafting-linework svg')).toContainText('BRACED BAY / ELEVATION');
 expect(errors).toEqual([]);
});

test('carries the girder on column caps over new freestanding columns',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Load new-column example'}).first().click();
 await expect(page.getByRole('button',{name:'Generate output',exact:true})).toBeEnabled({timeout:540000});
 // Direct column bearing replaces the bracket: the cap inputs appear and the cap checks replace the tie.
 await page.getByLabel('Girder support on the new column').selectOption('cap');
 await expect(page.getByText('Cap plate length along runway')).toBeVisible();
 await expect(page.getByText('Column cap · arrangement and load path').first()).toBeAttached({timeout:540000});
 await expect(page.getByRole('button',{name:'Generate output',exact:true})).toBeEnabled({timeout:540000});
 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 await expect(tabs.filter({hasText:'S-03'})).toHaveCount(1,{timeout:120000});
 await tabs.filter({hasText:'S-03'}).first().click();
 await expect(page.locator('.drafting-linework svg')).toContainText('GIRDER BEARING / COLUMN CAP');
 await expect(page.locator('.drafting-linework svg')).toContainText('COLUMN CAP DESIGN FORCES');
 expect(errors).toEqual([]);
});

test('edits an issued sheet in the CAD editor and carries the edit into the outputs',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Load demonstration'}).first().click();
 const generate=page.getByRole('button',{name:'Generate output',exact:true});
 await expect(generate).toBeEnabled({timeout:540000});
 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 await expect(tabs.filter({hasText:'S-01'})).toHaveCount(1,{timeout:120000});
 await tabs.filter({hasText:'S-01'}).first().click();
 await page.getByRole('button',{name:'Edit in CAD'}).click();
 await expect(page.getByTestId('cad-canvas')).toBeVisible();
 // AutoCAD-style command line: TEXT at a typed point, height, rotation, contents, then an empty line ends it.
 const line=page.getByLabel('Command line');
 for(const value of ['T','30,20','0.25','0','CAD EDIT CHECK','']){await line.fill(value);await line.press('Enter');}
 await expect(page.locator('.cad-save')).toHaveText('Edits saved in this browser');
 await page.getByRole('button',{name:'Close the CAD editor'}).click();
 await expect(page.locator('.drafting-badge')).toHaveText(/edited/i);
 await expect(page.locator('.drafting-linework svg')).toContainText('CAD EDIT CHECK');
 await generate.click();
 const dialog=page.getByRole('dialog',{name:'Generated output'});
 await expect(dialog).toBeVisible({timeout:120000});
 await expect(dialog.locator('.cad-edited-note')).toContainText('S-01');
 const set=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download drawing set (.dxf)'}).click();
 expect(await fs.readFile((await (await set).path())!,'utf8')).toContain('CAD EDIT CHECK');
 const report=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download printable report (.html)'}).click();
 expect(await fs.readFile((await (await report).path())!,'utf8')).toContain('CAD EDIT CHECK');
 expect(errors).toEqual([]);
});

test('builds a project from a template and from the quick configurator',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await expect(page.locator('.template-card')).toHaveCount(16);
 // The configurator summary sizes the girder for the chosen crane.
 await page.locator('.template-card').first().getByRole('button',{name:'Customize'}).click();
 await expect(page.locator('.config-summary')).toContainText(/W\d+X\d+/,{timeout:60000});
 await page.getByLabel('Rated capacity').fill('5');
 await expect(page.locator('.config-summary')).toContainText('rated 10.0 kip',{timeout:60000});
 // Dependent choices: a column cap needs new columns.
 await page.getByLabel('Girder support').selectOption('column-cap');
 await expect(page.getByRole('combobox',{name:'Structure',exact:true})).toHaveValue('new');
 // Build the girder-analysis template: the project is replaced and calculates.
 await page.locator('.template-card').filter({hasText:'Girder analysis only'}).getByRole('button',{name:'Build'}).click();
 await expect(page.getByRole('button',{name:'Inputs & checks'})).toHaveAttribute('aria-pressed','true',{timeout:60000});
 await expect(page.locator('.calculation-project')).toContainText('TPL-T12');
 await expect(page.getByText('Vertical crane-load deflection').first()).toBeAttached({timeout:240000});
 expect(errors).toEqual([]);
});
