import {parser} from "lezer-python";
import {Tree, TreeCursor} from "lezer-tree";
import { isVariableDeclaration } from "typescript";
import {Expr, Literal, Stmt, varInits, typedVar, funDefs, Type, Program, binOp} from "./ast";


export function traverseArgs(c: TreeCursor, s: string) : Array <Expr<null>> {
  var args: Array<Expr<null>> = [];
  c.firstChild();
  while(c.nextSibling()) {
    if(c.type.name === ')')
      break;
    args.push(traverseExpr(c, s));
    c.nextSibling();
  }
  c.parent();
  return args;
}

export function traverseLiteral(c: TreeCursor, s: string): Literal <null>{
  switch(c.type.name) {
    case "Number":
      return {tag: "num", value: Number(s.substring(c.from, c.to))}
    case "Boolean":
      var bool_val:boolean = null
      switch(s.substring(c.to, c.from)) {
        case "True": 
          bool_val = true
          break
        case "False":
          bool_val = false
          break
        case "UnaryExpression":
          c.firstChild();
          if(s.substring(c.from, c.to) === "-"){
            return {tag: "num", value: Number('-'+s.substring(c.from, c.to))}
          }
        default:
          throw new Error("PARSE ERROR: invalid value to boolean")
      }
      return {tag: "bool", value: bool_val}
    case "None":
      return {tag: "none"}
    default:
      throw new Error("PARSE ERROR: Invalid literal")
  }
}

export function traverseExpr(c : TreeCursor, s : string) : Expr<null> {
  switch(c.type.name) {
    case "Number":
      return {
        tag: "literal",
        literal: traverseLiteral(c, s)
      }
    case "Boolean":
      return {
        tag: "literal",
        literal: traverseLiteral(c, s)
      }  
    case "None":
        return {
          tag: "literal",
          literal: traverseLiteral(c, s)
        }  

    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to)
      }

    case "CallExpression":
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      c.nextSibling();
      console.log("Yes")
      console.log(c.type.name)
      const args = traverseArgs(c, s);
      console.log(c.type.name)
      c.parent()
      console.log(c.type.name)
      console.log("No")
      if(callName === "print" && args.length != 1) {
          throw new Error("PARSE ERROR: print only takes 1 value");
      } 
      return {
        tag: "call",
        name: callName,
        args:args
        };

    case "UnaryExpression":
      c.firstChild();
      var uniOp = s.substring(c.from, c.to);
      if(uniOp !== "-" && uniOp !== "not") {
        throw new Error("PARSE ERROR: Unsupported unary operator")
      }
      c.nextSibling();
      const expr = traverseExpr(c, s);
      c.parent();
      return {tag: "uniop",  op: uniOp, arg: expr};

    case "BinaryExpression":
      c.firstChild();
      const left = traverseExpr(c, s);
      c.nextSibling();
      var op: binOp = null
      switch(s.substring(c.from, c.to)) {
        case "+":
          op = binOp.PLUS
          break
        case "-":
          op = binOp.MINUS
          break
        case "*":
          op = binOp.MUL
          break
        case "//":
          op = binOp.DIV
          break
        case "%":
          op = binOp.MOD
          break
        case "==":
          op = binOp.EQUALS
          break
        case "!=":
          op = binOp.NOTEQUALS
          break
        case "<=":
          op = binOp.LEQ
          break
        case ">=":
          op = binOp.GEQ
          break
        case "<":
          op = binOp.LQ
          break
        case ">":
          op = binOp.GQ
          break
        case "is":
          op = binOp.IS  
          break   
        default:
          throw new Error ("PARSE ERROR: Unknown Binary Operator")
      }
      c.nextSibling();
      const right = traverseExpr(c, s);
      c.parent();
      return {tag: "binop", left, op, right }
    case "ParenthesizedExpression":
      c.firstChild()
      c.nextSibling()
      const pexpr = traverseExpr(c, s)
      c.parent()
      return pexpr

    default:
      console.log("Start");
      console.log(s.substring(c.from, c.to));
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt<null> {
  switch(c.node.type.name) {
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      c.nextSibling(); // go to equals
      c.nextSibling(); // go to value
      const value = traverseExpr(c, s);
      c.parent();
      return {
        tag: "assign", 
        name: name,
        value: value
      };
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr };

    case "PassStatement":
      c.firstChild();
      c.parent();
      return {tag: "pass"}

    case "ReturnStatement":
      c.firstChild();

      let retValue:Expr<null> = {tag: "literal", literal: {tag: "none"} };

      c.nextSibling();
      if(c.type.name.length > 1) {
        retValue = traverseExpr(c, s)
      }
      c.parent();
      return {tag: "return", ret: retValue}
    
    case "IfStatement":
      c.firstChild();
      c.nextSibling();
      console.log("If debug")
      console.log(c.type.name)
      const if_cond = traverseExpr(c, s)
      c.nextSibling() 
      console.log("If debug")
      console.log(c.type.name)
      const if_stmt = traverseBody(c, s)
      let elif_cond: Expr <null> = null
      let elif_stmt : Stmt<null> = null
      let elif_block: Stmt <null>[]= []
      let else_block: Stmt <null>[] = []

  
      if(c.nextSibling()) {
        
        if(c.type.name == "elif") {
          c.nextSibling()
          elif_cond = traverseExpr(c, s)
          c.nextSibling()
          const elifbody = traverseBody(c, s)
          c.nextSibling()
          elif_stmt = {
            tag: "if",
            cond: elif_cond,
            if_block: elifbody,
            elif_block: [],
            else_block: []
          }
          elif_block.push(elif_stmt)
        }
        if(c.type.name == "else")  {
          c.nextSibling();
          c.nextSibling();
          else_block = traverseBody(c, s)
          if(elif_stmt == null) {
            c.parent();
            return {
              tag: "if", cond: if_cond, if_block: if_stmt , elif_block: elif_block, else_block: else_block
            }
          }
          c.parent();
          //@ts-ignore
          elif_block[0].else_block = else_block
    
          return {
              
              tag: "if", cond: if_cond, if_block: if_stmt , elif_block: elif_block, else_block: []
          }
          //const elifbody = traverseBody(c, s)
        }
      }
      c.parent();
      return {
              
        tag: "if", cond: if_cond, if_block: if_stmt , elif_block: elif_block, else_block: else_block
    }


    case "WhileStatement":
      c.firstChild()
      c.nextSibling()
      const cond = traverseExpr(c, s)
      c.nextSibling()
      const while_block = traverseBody(c, s)
      c.parent()
      return {
        tag: "while",
        cond: cond,
        while_block: while_block
      } 
    default:
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to) + " " + c.node.type.name + "\n");
  }
}

function traverseBody(c : TreeCursor, s : string) : Stmt<null>[] {
  const stmts: Stmt<null>[] = [];
  c.firstChild()
  while(c.nextSibling()) {
    const stmt = traverseStmt(c, s);
    stmts.push(stmt);
  }
  c.parent();
  return stmts;

}

function traverseType(c : TreeCursor, s : string) : Type {
  switch (s.substring(c.from, c.to)) {
    case "int":
      return Type.int
    case "bool":
      return Type.bool
    case "None":
      return Type.none      
  }

}

function isVarDecl(c : TreeCursor, s : string) :  boolean{
  if(c.type.name != "AssignStatement") {
    return false;
  }
  c.firstChild();
  c.nextSibling();
  //@ts-ignore
  if(c.type.name == "TypeDef") {
    c.parent();
    return true;
  }
  c.parent();
  return false;

}

function isFunDef(c : TreeCursor, s : string) :  boolean{
  if (c.type.name=="FunctionDefinition")
  return true
else return false

}

function traverseFunDefs(c : TreeCursor, s : string) : funDefs<null> {
  c.firstChild()
  c.nextSibling()
  const name = s.substring(c.from, c.to);

  c.nextSibling() // params
  c.firstChild()
  c.nextSibling()
  const params: typedVar<null>[] = [];
  do{
    if (c.type.name === ")")
      break
    params.push(traverseTypedVar(c, s))
    c.nextSibling()
  } while(c.nextSibling())  

  c.parent()
  c.nextSibling() // return type
  var ret = Type.none
  if(c.type.name == "TypeDef") {
    c.firstChild();
    c.nextSibling();
    ret = traverseType(c, s);
    c.parent();
  }
  c.nextSibling();
  c.firstChild();
  c.nextSibling();


  const inits: varInits<null>[] = [];
  const body: Stmt <null>[] = [];
  do{
    if(isVarDecl(c, s)) {
      inits.push(traverseVarInit(c, s))
    }
    else if(isFunDef(c, s)) {
      throw new Error("PARSE ERROR: nested functions not supported")
    }
    else {
      break;
    }
  }while(c.nextSibling());


  do{
    if(isVarDecl(c, s) || isFunDef(c, s)) {
      throw new Error("PARSE ERROR: PARSE ERROR: variables and function definition after statement")
    }
  //console.log("Parse Debug Start")
  //console.log(c.type.name);
  //console.log(s.substring(c.from, c.to))
  //console.log("Parse Debug End")
  body.push(traverseStmt(c, s));
  } while(c.nextSibling());

  c.parent();
  c.parent();
  if(ret == Type.none) {
    body.push({tag: "return", ret: {tag: "literal", literal:{tag: "none"}}})
  }
  return {name, params, ret, inits, body}
}

function traverseTypedVar(c : TreeCursor, s : string) : typedVar<null> {
  const name = s.substring(c.from, c.to);
  c.nextSibling();
  c.firstChild();
  c.nextSibling();
  const type = traverseType(c, s);
  c.parent();
  return {name, type}
}

function traverseVarInit(c : TreeCursor, s : string) : varInits<null> {
  c.firstChild(); // go to name
  const {name, type} = traverseTypedVar(c, s)
  c.nextSibling();
  c.nextSibling();
  const init = traverseLiteral(c, s)
  c.parent();
  return {name, type, init};


}
export function traverse(c : TreeCursor, s : string) : Program<null>
 {
  switch(c.node.type.name) {
    case "Script":
      const varinits: varInits <null>[] = [];
      const fundefs: funDefs<null>[] = [];
      const stmts: Stmt <null>[] = [];

      // add if you need empty program to run
      // if(!c.firstChild()) {
      //   return [];
      // }

      c.firstChild();
      do{
        
        if(isVarDecl(c, s)) {
          varinits.push(traverseVarInit(c, s))
        }
        else if(isFunDef(c, s)) {
          fundefs.push(traverseFunDefs(c, s))
        }
        else 
          break;
      if(c.nextSibling()) {
        continue;
      }
      else 
        return {varinits, fundefs, stmts }
      }while(true)
      do{
        if(isVarDecl(c, s) || isFunDef(c, s)) 
          throw new Error("PARSE ERROR: variables and function definition after statement")
        stmts.push(traverseStmt(c, s))
      } while(c.nextSibling())
      console.log("Statement End")
      return {varinits, fundefs, stmts }
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source : string) :Program<null> {
  const t = parser.parse(source);
  console.log(stringifyTree(t.cursor(),source, 0 ))
  return traverse(t.cursor(), source);
}

export function stringifyTree(t: TreeCursor, source: string, d: number): string {
  var str = "";
  var spaces = " ".repeat(d*2);
  str += spaces + t.type.name;
  if (["Number", "CallExpression", "BinaryExpression", "UnaryExpression", "ArithOp", "VariableName"].includes(t.type.name)) { 
    str += " --> " + source.substring(t.from, t.to)
  }
  str += "\n";
  if (t.firstChild()) {
    do {
      str += stringifyTree(t, source, d+1);
    } while(t.nextSibling());
    t.parent();
  }
  return str;
}
