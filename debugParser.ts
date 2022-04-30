import  { parse } from './parser';
import {typeCheckProgram } from "./typecheck"
import {readFileSync} from "fs"
import { compile } from './compiler';
import {run} from './runner';

//const source = "def func(x:int, y:int) -> int:  return x \n)"

//const source = "x:int = 10 \n if(x == 1): print(10) \n elif(x == 20): print(20) \n else: print(30)"

//const source = 
//"x:int = 10 \ndef func(x:int) -> int: \n if(x == 1): return 10 \n elif(x == 2): return 20 \n else: return 30 \n print(func(x))";
  
//const source = "x:int = 5 \n if(x == 5): print(x) \n"

//const source = "def func(n:int) -> int: \n if(n == 0): return 1 \n\n return 10  \n\n\n"
const source = readFileSync("test.py").toString()
var ast = parse(source);
console.log("parser");
console.log(JSON.stringify(ast, null, 2))
let ast1 = typeCheckProgram(ast)
console.log("Debug start again")
console.log(JSON.stringify(ast1, null, 2));
const compiled = compile(ast1)
console.log(compiled);

