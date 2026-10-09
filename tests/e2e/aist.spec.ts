import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {designProject} from '../fixtures/aistProject';
import {fingerprint} from '../../src/engine/calculate';

test('AIST equations, combinations, project inputs, units and validation gates',async({page,request})=>{
 const p=designProject(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(input=>localStorage.setItem('cranecalc.project.v1',JSON.stringify(input)),p);
 await page.goto('/');await expect(page.getByText('Live calculation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Equations & checks',exact:true}).click();
 await page.getByText(/AIST LRFD combinations ·/).click();await expect(page.locator('.design-combinations')).toContainText('LRFD 2c');
 await page.getByRole('button',{name:/Concurrent axial & biaxial interaction/}).click();await expect(page.locator('.check-card').filter({hasText:'Concurrent axial & biaxial interaction'})).toContainText('H1-1');
 await page.getByRole('button',{name:/Wheel web local yielding/}).click();await expect(page.locator('.check-card').filter({hasText:'Wheel web local yielding'})).toContainText('2(rail depth+tf)');
 await expect(page.locator('.katex-error')).toHaveCount(0);await expect(page.getByRole('button',{name:'Generate output',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:/Major-axis flexure & lateral-torsional buckling/}).click();await page.getByRole('button',{name:'Criteria',exact:true}).click();await fs.mkdir('tmp/aist',{recursive:true});await page.screenshot({path:'tmp/aist/worksheet-preview.png'});await page.screenshot({path:'tmp/aist/worksheet-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Criteria',exact:true}).click();await expect(page.getByText('Reference: AIST Technical Report 13',{exact:true})).toBeVisible();
 await page.getByText('Girder bearing & actual restraints',{exact:true}).click();await expect(page.getByLabel('Actual rail depth',{exact:true})).toHaveValue('5.9055118');
 await page.getByRole('button',{name:'SI',exact:true}).click();await expect(page.getByLabel('Actual rail depth',{exact:true})).toHaveValue('150');
 await page.getByLabel('Actual rail depth',{exact:true}).fill('0');await expect(page.getByText('Live calculation',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Wheel loads & concentrated support forces/})).toBeVisible();
 await page.getByRole('button',{name:'ASD',exact:true}).click();await expect(page.getByText('Live calculation',{exact:true})).toBeVisible();await expect(page.getByText(/AIST ASD combinations ·/)).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/aist/worksheet-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await expect.poll(async()=>{const rejected=await request.post('/api/report',{data:{input:p,revision:fingerprint(p)}});return rejected.status();},{timeout:20000}).toBe(422);expect(errors).toEqual([]);
});

test('AIST owner class and minimum crane loads recalculate from the compact forms',async({page})=>{
 const p=designProject();await page.addInitScript(input=>localStorage.setItem('cranecalc.project.v1',JSON.stringify(input)),p);await page.goto('/');await expect(page.getByText('Live calculation',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Criteria',exact:true}).click();await page.getByLabel('AIST building class',{exact:true}).selectOption('D');await page.getByLabel('Building load repetitions',{exact:true}).fill('10000');
 await page.getByRole('button',{name:'Equations & checks',exact:true}).click();await page.getByRole('button',{name:/Vertical crane-load deflection/}).click();await expect(page.locator('.check-card').filter({hasText:'Vertical crane-load deflection'})).toContainText('L/600');
 await page.getByRole('button',{name:'Crane loads',exact:true}).click();await page.getByText('AIST crane type & minimum loads',{exact:true}).click();
 await page.getByLabel('Crane 1 control type',{exact:true}).selectOption('pendant');await page.getByRole('button',{name:/Vertical impact/}).click();await expect(page.locator('.check-card').filter({hasText:'Vertical impact'})).toContainText('Required 10%');
 await page.getByLabel('Crane 1 control type',{exact:true}).selectOption('cab');await page.getByLabel('Crane 1 AIST type',{exact:true}).selectOption('maintenance');await expect(page.locator('.check-card').filter({hasText:'Vertical impact'})).toContainText('Required 20%');
 await page.getByRole('button',{name:'References',exact:true}).click();await expect(page.locator('.source-intro')).toContainText('AIST Technical Report 13');await expect(page.locator('.source-intro')).not.toContainText('draft');
});
