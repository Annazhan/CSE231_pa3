import { parse } from "../parser";
import { typeCheckProgram } from "../typecheck";
import { importObject } from "./import-object.test";
import {run as runner} from '../runner';

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  let ast = parse(source);
  let tc = typeCheckProgram(ast)
  if (tc.a === "bool" || tc.a === "int" || tc.a === "none"){
    return tc.a;
  }
  return {
    tag: "object",
    class: tc.a.name,
  };
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string) {
  var importObject = {
    imports: {
      print_num: (arg : any) => {
        console.log("Logging from WASM: ", arg);
        const elt = document.createElement("pre");
        document.getElementById("output").appendChild(elt);
        elt.innerText = arg;
        return arg;
      },
      print_bool: (arg : any) => {
        console.log("Logging from WASM: ", arg);
        const elt = document.createElement("pre");
        document.getElementById("output").appendChild(elt);
        let arg1 = ""
        if(arg == 1) {
          arg1 = "True"
        }
        else
          arg1 = "False"
        elt.innerText = arg1;
        
        return arg1;
      },
      print_none: (arg : any) => {
        console.log("Logging from WASM: ", arg);
        const elt = document.createElement("pre");
        document.getElementById("output").appendChild(elt);
        arg = "None"
        elt.innerText = arg;
        return arg;
      },
      abs: Math.abs,
      max: Math.max,
      min: Math.min, 
      pow: Math.pow
    },
  };
  return await runner(source, {importObject});
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
