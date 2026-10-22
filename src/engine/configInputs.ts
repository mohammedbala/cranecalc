import {z} from 'zod';

/**
 * Quick-configurator choices: the few decisions that set up a whole runway project (the crane, the runway, the girder,
 * how it is supported and tied back, and whether the columns are existing or new). US customary values as the user
 * states them: US tons, feet and inches. configurator.ts turns them into a complete project.
 */
/**
 * One configurator selection, as recorded on the built project: a member or part that differs from the configuration
 * as entered, or that the configurator chose where the choice was left blank, with the governing reason (the sizing
 * check and ratio that drove it, or the configuration rule).
 */
export const configSelectionSchema=z.object({
 item:z.string().max(60),
 /** As entered; 'configurator default' where the choice was left blank. */
 entered:z.string().max(160),
 designed:z.string().max(200),
 reason:z.string().max(800),
});
export type ConfigSelection=z.infer<typeof configSelectionSchema>;
/**
 * 'crane-column': a separate new crane column beside each existing building column, the girder on its cap, tied to the
 * building column (craneColumnInputs.ts). 'stepped-column': the girder on the step of an existing stepped column
 * (steppedColumnInputs.ts). Both are existing-structure arrangements; a new structure takes column caps instead.
 */
export const supportKinds=['by-others','twin-rib','haunched-seat','rolled-corbel','tapered-haunch','column-cap','crane-column','stepped-column'] as const;
export const tieKinds=['paired-bars','flexible-plate','cap-angle'] as const;
export const runwayConfigSchema=z.object({
 /** Template the configuration started from, for the record. */
 template:z.string().max(40).optional(),
 title:z.string().min(1).max(120),
 number:z.string().max(80),
 units:z.enum(['US','SI']),
 method:z.enum(['LRFD','ASD']),
 /** 'design': girder, connections, supports and drawings; 'analysis': the girder under supplied loads only. */
 scope:z.enum(['design','analysis']),
 /** Rated capacity, US tons. */
 capacity:z.number().finite().min(.5).max(60),
 /** Crane span, rail to rail, ft. */
 craneSpan:z.number().finite().min(20).max(150),
 control:z.enum(['cab','pendant']),
 cmaa:z.enum(['A','B','C','D']),
 /**
  * AIST TR-13 Table 3.2 crane type (vertical impact and side thrust of a cab or radio operated crane); blank: a mill
  * crane, or a maintenance (standby) crane where the CMAA class is A. Pendant cranes take 0.1(Q + T + B) whatever the type.
  */
 aistType:z.enum(['mill','maintenance','magnet','stacker']).optional(),
 cranes:z.union([z.literal(1),z.literal(2)]),
 buildingClass:z.enum(['A','B','C','D']),
 system:z.enum(['simple','continuous']),
 bays:z.number().int().min(1).max(6),
 /** Bay length, column to column, ft. */
 span:z.number().finite().min(10).max(50),
 /** Top of rail above the floor, ft. */
 railElevation:z.number().finite().min(10).max(60),
 girder:z.enum(['rolled','capped']),
 /** Catalog W shape of the girder; blank: sized by the configurator. */
 girderShape:z.string().max(30).optional(),
 /** Cap channel of a capped girder; blank: sized by the configurator. */
 capChannel:z.string().max(30).optional(),
 structure:z.enum(['existing','new']),
 support:z.enum(supportKinds),
 tie:z.enum(tieKinds),
 /** Supporting column W shape; blank: chosen for the crane. */
 columnShape:z.string().max(30).optional(),
 /** Column face to the girder web centerline, in; blank: 20 in, or farther (to 30 in) where the tie needs the flexible length. */
 reach:z.number().finite().min(12).max(48).optional(),
 /**
  * Existing columns: where the crane longitudinal force leaves the column, a crane-level strut by others on the girder
  * line or at the column centerline, or none (the eave strut at the column top takes it). Blank: the column-centerline
  * strut, or the girder-line strut where the column fails torsion from the girder offset with it.
  */
 longitudinalExit:z.enum(['girder-strut','column-strut','eave-strut']).optional(),
 /**
  * The existing building column of a crane-column support (blank: chosen for the crane, as columnShape is for the other
  * existing supports; columnShape is then the new crane column), or the upper shaft of a stepped column (blank: from the
  * crane; columnShape is then the lower shaft).
  */
 buildingColumnShape:z.string().max(30).optional(),
 /** Crane-column base: pinned (four anchor rods, default) or fixed. */
 craneColumnBase:z.enum(['pinned','fixed']).optional(),
 /**
  * Rail pad: blank, an elastomeric pad under rails 5 in deep and deeper, the clips at most 24 in apart; false, the rail
  * bears directly on the girder and the clips stand at most 30 in apart (AIST TR-13 opposing clip spacing without a pad).
  */
 railPad:z.boolean().optional(),
 /** Set by the configurator on the built project (buildProject), never read as a choice: its selection log. */
 selections:z.array(configSelectionSchema).max(24).optional(),
 /**
  * Set by the configurator on the built project, never read as a choice: members the catalog cannot supply within the
  * sizing targets (a plate girder or a built-up crane column required). calculate reports each as an open item while the
  * project still has that member (configuratorOpenItems): the closest member is built and checked, a review draft.
  */
 beyondCatalog:z.array(z.object({member:z.enum(['girder','crane-column','tie','column-cap']),shape:z.string().max(80),reason:z.string().max(800)})).max(4).optional(),
});
export type RunwayConfig=z.infer<typeof runwayConfigSchema>;
/** The reason's opening of a new freestanding column that no W14 brings within its drift, torsion and twist ratios (configurator withColumnBase; beyondCatalog member 'crane-column'). */
export const newColumnBeyond='New column beyond the W14 range';
/** Which girder catalogs the plate-girder open item's reason says were exhausted (configurator girderOpenReason). */
export const girderCatalogsExhausted=(reason:string)=>/compact rolled W/.test(reason)&&/channel cap/.test(reason)?'rolled W and capped catalogs exhausted':/channel cap/.test(reason)?'capped catalog exhausted':'outside the rolled/capped catalog';
export type SupportKind=RunwayConfig['support'];
export type TieKind=RunwayConfig['tie'];

export const supportLabels:Record<SupportKind,string>={
 'by-others':'Bracket by others (existing)','twin-rib':'Welded twin-rib seat','haunched-seat':'Haunched (tapered) rib seat','rolled-corbel':'Rolled W-stub bracket','tapered-haunch':'Built-up tapered I haunch','column-cap':'Column cap (new columns)',
 'crane-column':'Crane column tied to the building column (existing)','stepped-column':'Girder on the column step (existing stepped column)'};
export const tieLabels:Record<TieKind,string>={'paired-bars':'Paired flat bars','flexible-plate':'Flexible plate','cap-angle':'Cap tieback angle'};

/**
 * Support offered when the structure is chosen: new columns bear the girders on column caps (no torsion from a bracket
 * offset; a crane column or a column step needs an existing building column); an existing structure keeps its support,
 * a column cap becoming the twin-rib seat.
 */
export const defaultSupportFor=(structure:RunwayConfig['structure'],current:SupportKind):SupportKind=>structure==='new'?'column-cap':current==='column-cap'?'twin-rib':current;
export const defaultRunwayConfig:RunwayConfig={title:'Crane runway',number:'',units:'US',method:'LRFD',scope:'design',capacity:10,craneSpan:60,control:'cab',cmaa:'C',cranes:1,buildingClass:'C',
 system:'simple',bays:3,span:25,railElevation:20,girder:'rolled',structure:'existing',support:'twin-rib',tie:'paired-bars'};
