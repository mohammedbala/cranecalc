/**
 * Open items the review (G1, items A3/A4/B12) surfaces on the demonstration crane data, which are left unchanged:
 * their wheel loads exceed the crane weights (statics), bridge speed, minimum wheel loads and bumper data are not
 * entered, and the building class is stated without the TR-13 Table 1.1 counting basis. Tests of other features
 * that require "no failed checks" exclude these, and only these.
 */
export const reviewOpenItem=(c:{id:string;group:string})=>c.group==='Crane input'||c.group==='Bumper selection'||c.id==='building-class'||c.id==='fatigue-cycles';
