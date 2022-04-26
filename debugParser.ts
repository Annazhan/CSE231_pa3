import  { parse } from './parser';
import {typeCheckProgram } from "./typecheck"

//const source = "def func(x:int, y:int) -> int:  return x \n)"

//const source = "x:int = 10 \n if(x == 1): print(10) \n elif(x == 20): print(20) \n else: print(30)"

//const source = 
//"x:int = 10 \ndef func(x:int) -> int: \n if(x == 1): return 10 \n elif(x == 2): return 20 \n else: return 30 \n print(func(x))";
  
//const source = "x:int = 5 \n if(x == 5): print(x) \n"

//const source = "def func(n:int) -> int: \n if(n == 0): return 1 \n\n return 10  \n\n\n"
const source = "x = 5 - (4 + 3)"
var ast = parse(source);
let ast1 = typeCheckProgram(ast)
console.log("Debug start")
console.log(JSON.stringify(ast, null, 2));
console.log("Debug start again")
console.log(JSON.stringify(ast1, null, 2));
