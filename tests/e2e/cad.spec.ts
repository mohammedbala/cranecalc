import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';

const watch=(page:Page)=>{const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());return errors;};
/** Open the first engineering sketch of the default project in the CAD editor. */
async function openEditor(page:Page){
 await page.goto('/');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Drawings'}).click();
 await expect(page.locator('.drafting-views button').first()).toBeVisible({timeout:240000});
 await page.locator('.drafting-views button').first().click();
 await page.getByRole('button',{name:'Edit in CAD'}).click();
 await expect(page.getByTestId('cad-canvas')).toBeVisible();
 const line=page.getByLabel('Command line');
 const type=async(...values:string[])=>{for(const v of values){await line.fill(v);await line.press('Enter');}};
 const objects=async()=>{await page.keyboard.press('Escape');return Number((await page.locator('.cad-props dt:has-text("Objects") + dd').textContent())!.replace(/,/g,''));};
 return {line,type,objects};
}

test('drafting core: new draw and modify commands from the command line',async({page})=>{
 const errors=watch(page);
 const {type,objects}=await openEditor(page);
 const start=await objects();
 // Two lines meeting at a corner, filleted; an ellipse; a hexagon arrayed; a spline; a construction line.
 await type('L','100,50','300,50','','L','100,50','100,200','');
 await type('F','R','20','100,120');
 await expect(page.locator('.cad-cmd span')).toContainText('Select second object');
 await type('200,50');
 await expect(page.locator('.cad-cmd span')).toHaveText('Command:');
 await type('EL','400,100','500,100','20');
 await type('POL','6','600,100','I','15');
 expect(await objects()).toBe(start+5);
 await type('SPL','100,300','150,330','200,300','');
 await type('XL','H','0,250','');
 expect(await objects()).toBe(start+7);
 const svg=page.waitForEvent('download');await page.getByRole('button',{name:'SVG'}).click();
 const text=await fs.readFile((await (await svg).path())!,'utf8');
 expect(text).toContain('<ellipse');
 expect((text.match(/<polyline/g)??[]).length).toBeGreaterThan(1);
 expect(errors).toEqual([]);
});

test('precision and selection: dynamic input, selection options, groups and quick select',async({page})=>{
 const errors=watch(page);
 const {line,type,objects}=await openEditor(page);
 const start=await objects();
 // Dynamic input: a typed length locked with Tab, then the angle (the tooltip follows the cursor).
 const box=(await page.getByTestId('cad-canvas').boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await type('L','100,50');
 await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2-20);
 await line.fill('50');await line.press('Tab');
 await expect(page.locator('.cad-dyn em')).toContainText('locked');
 await type('90','');
 await type('L','120,50','120,100','');
 expect(await objects()).toBe(start+2);
 // A fence across both lines makes a group; erasing the group by name removes both.
 await type('GROUP','F','90,75','130,75','','','PAIR');
 await expect(page.locator('.cad-log')).toContainText('Group PAIR made of 2 objects');
 await type('E','G','PAIR','');
 expect(await objects()).toBe(start);
 await type('U');
 expect(await objects()).toBe(start+2);
 // Quick select by layer.
 await type('QSELECT');
 const dialog=page.getByRole('dialog',{name:'Quick select'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Select',exact:true}).click();
 await expect(page.locator('.cad-props dt:has-text("Selected") + dd')).toBeVisible();
 // Snap settings and polar angle popovers.
 await page.getByRole('button',{name:'Object snap settings'}).click();
 await expect(page.getByRole('dialog',{name:'Object snap settings'}).getByLabel('Tangent')).toBeChecked();
 await page.getByRole('button',{name:'Polar tracking angle'}).click();
 await page.getByRole('dialog',{name:'Polar tracking angle'}).getByLabel('45°').check();
 await page.keyboard.press('F10');
 await expect(page.getByRole('button',{name:'POLAR',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(errors).toEqual([]);
});
