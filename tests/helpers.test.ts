import { parse } from "../parser";
import { typeCheckProgram } from "../typecheck";
import { importObject } from "./import-object.test";
import {run as runner} from '../runner';

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  let ast = parse(source);
  let tc = typeCheckProgram(ast)

  const lastExpr = tc.stmts[tc.stmts.length - 1]
  
  if(lastExpr && (lastExpr.tag === "expr" || lastExpr.tag === "assign")) {
    if (lastExpr.a === "bool" || lastExpr.a === "int" || lastExpr.a === "none"){
      return lastExpr.a;
    }
    return {
      tag: "object",
      class: lastExpr.a.name,
    };
  }

  
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers

export async function run(source: string) {
  await runner(source, {importObject});
  return 
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};