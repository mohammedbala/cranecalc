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
 // A rectangle hatched from a point inside it (boundary detection), then a solid fill.
 await type('REC','700,200','800,260','H','750,230','','H','P','SOLID','720,210','');
 await expect(page.locator('.cad-log')).toContainText('Boundary found');
 expect(await objects()).toBe(start+10);
 const svg=page.waitForEvent('download');await page.getByRole('button',{name:'SVG'}).click();
 const text=await fs.readFile((await (await svg).path())!,'utf8');
 expect(text).toContain('<ellipse');expect(text).toContain('fill-rule="evenodd"');
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

test('annotation: ribbon, multiline text, dimensions, leaders, tables, clouds and styles',async({page})=>{
 const errors=watch(page);
 const {line,type,objects}=await openEditor(page);
 const start=await objects();
 await page.getByRole('tab',{name:'Annotate'}).click();
 await expect(page.getByRole('button',{name:'Multiline text (MT)'})).toBeVisible();
 await type('MT','100,350','300,320','PLATE 3/4" X 12"','A36 TYP','');
 await type('L','400,100','500,100','','L','400,100','400,200','','DAN','450,100','400,150','440,140');
 await type('MLD','420,220','470,260','FIELD WELD','');
 await type('TB','2','2','','','600,300');
 await type('REVCLOUD','550,50','650,120');
 expect(await objects()).toBe(start+7);
 // Double-click a table cell and type in it.
 await type('DIMSTYLE');
 const dlg=page.getByRole('dialog',{name:'Dimension styles'});
 await dlg.getByRole('button',{name:'New'}).click();
 await dlg.getByLabel('Arrowheads').selectOption('tick');
 await dlg.getByRole('button',{name:'Set current'}).click();
 await expect(page.locator('.cad-log')).toContainText('Current dimension style: Style 1');
 await dlg.getByRole('button',{name:'Close styles'}).click();
 await type('STYLE');
 const ts=page.getByRole('dialog',{name:'Text styles'});
 await ts.getByLabel('Font').selectOption('Times New Roman');
 await ts.getByRole('button',{name:'Close styles'}).click();
 const svg=page.waitForEvent('download');await page.getByRole('button',{name:'SVG'}).click();
 const text=await fs.readFile((await (await svg).path())!,'utf8');
 for(const s of ['A36 TYP','FIELD WELD','90°'])expect(text).toContain(s);
 expect(text).toContain('Times New Roman');
 expect(errors).toEqual([]);
});

test('blocks: library, attributes, block editor and external references',async({page})=>{
 const errors=watch(page);
 const {type,objects}=await openEditor(page);
 const start=await objects();
 await page.getByRole('tab',{name:'Insert'}).click();
 await page.getByRole('button',{name:'Blocks palette: drawing and library blocks'}).click();
 const palette=page.getByRole('region',{name:'Blocks'});
 await palette.getByRole('button',{name:'Insert GRID-BUBBLE'}).click();
 await type('S','20','500,300','C7');
 await type('INSERT','WELD-FILLET-FIELD','600,250','SMAW','5/16','6"');
 expect(await objects()).toBe(start+2);
 await expect(palette.getByRole('button',{name:'Edit GRID-BUBBLE'})).toBeVisible();
 // Edit the bubble's block: a circle added there shows in every reference.
 await palette.getByRole('button',{name:'Edit GRID-BUBBLE'}).click();
 await expect(page.locator('.cad-bedit')).toContainText('Block editor: GRID-BUBBLE');
 await type('C','0,0','0.4');
 await page.getByRole('button',{name:'Save block'}).click();
 await expect(page.locator('.cad-log')).toContainText('Block GRID-BUBBLE saved');
 expect(await objects()).toBe(start+2);
 // Another drawing of the project as an external reference, then bound into this one.
 await type('XATTACH','SK-03','0,0','');
 expect(await objects()).toBe(start+3);
 await type('XBIND','L','');
 await expect(page.locator('.cad-log')).toContainText('1 reference bound as blocks');
 const svg=page.waitForEvent('download');await page.getByRole('button',{name:'SVG'}).click();
 const text=await fs.readFile((await (await svg).path())!,'utf8');
 for(const s of ['C7','SMAW','5/16'])expect(text).toContain(s);
 expect(errors).toEqual([]);
});

test('layouts: model space, a viewport at scale, and plotting to PDF',async({page})=>{
 const errors=watch(page);
 await page.goto('/');
 await page.getByRole('button',{name:'Inputs & checks'}).click();
 await page.getByRole('button',{name:'Drawings'}).click();
 const tabs=page.locator('.drafting-views button');
 await expect(tabs.filter({hasText:'S-00'})).toHaveCount(1,{timeout:240000});
 await tabs.filter({hasText:'S-00'}).first().click();
 await page.getByRole('button',{name:'Edit in CAD'}).click();
 await expect(page.getByTestId('cad-canvas')).toBeVisible();
 const line=page.getByLabel('Command line');
 const type=async(...values:string[])=>{for(const v of values){await line.fill(v);await line.press('Enter');}};
 // Model space at real size: a 40 ft by 20 ft bay and an annotative note.
 await page.getByRole('tab',{name:'Model'}).click();
 await expect(page.locator('.cad-log')).toContainText('Model space');
 await type('REC','0,0',"40',20'",'T',"2',2'",'0.125','0','BAY A','');
 await page.getByRole('tab',{name:'S-00'}).click();
 await type('MV','2,2','14,9');
 await expect(page.locator('.cad-log')).toContainText('Viewport at');
 const plot=page.waitForEvent('download');
 await type('PLOT');
 await page.getByRole('dialog',{name:'Plot'}).getByRole('button',{name:'Plot',exact:true}).click();
 const pdf=await fs.readFile((await (await plot).path())!,'latin1');
 expect(pdf.startsWith('%PDF-1.4')).toBe(true);expect(pdf).toContain('(BAY A) Tj');expect(pdf).toContain('/MediaBox [0 0 2592 1728]');
 expect(errors).toEqual([]);
});

test('interchange: import a DXF as a block, export the drawing as DXF',async({page})=>{
 const errors=watch(page);
 const {type,objects}=await openEditor(page);
 const start=await objects();
 await page.getByLabel('DXF file to import').setInputFiles('tests/fixtures/cad/ezdxf-sample.dxf');
 await expect(page.locator('.cad-cmd span')).toContainText('IMPORT ezdxf-sample.dxf');
 await type('B','10,10');
 await expect(page.locator('.cad-log')).toContainText('imported as block EZDXF-SAMPLE');
 expect(await objects()).toBe(start+1);
 const dxf=page.waitForEvent('download');await page.getByRole('button',{name:'DXF',exact:true}).click();
 const text=await fs.readFile((await (await dxf).path())!,'utf8');
 expect(text).toContain('AC1015');expect(text).toContain('EZDXF-SAMPLE');expect(text).toContain('\nINSERT\n');
 expect(errors).toEqual([]);
});

test('associativity: a schedule placed from the design model',async({page})=>{
 const errors=watch(page);
 const {type,objects}=await openEditor(page);
 const start=await objects();
 await type('SCHEDULE');
 await expect(page.locator('.cad-cmd span')).toContainText('SCHEDULE members');
 await type('W','50,50');
 await expect(page.locator('.cad-log')).toContainText('WELD SCHEDULE from the design');
 expect(await objects()).toBe(start+1);
 const dxf=page.waitForEvent('download');await page.getByRole('button',{name:'DXF',exact:true}).click();
 const text=await fs.readFile((await (await dxf).path())!,'utf8');
 expect(text).toContain('WELD SCHEDULE');expect(text).toContain('ELECTRODE');
 expect(errors).toEqual([]);
});
