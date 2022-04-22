import { Stmt, Expr, binOp, Type, funDefs, Literal, varInits } from "./ast";
import { parse } from "./parser";
import {typeCheckProgram } from "./typecheck"

// https://learnxinyminutes.com/docs/wasm/

type Env = Map<string, boolean>;

type CompileResult = {
  wasmSource: string,
};

export function compile(source: string) : CompileResult {
  let ast = parse(source);
  let ast1 =  typeCheckProgram(ast)
  const vardefs = ast1.varinits
  const fundefs = ast1.fundefs
  const stmts = ast1.stmts

  const emptyEnv = new Map<string, boolean>()
  const funsCode: string [] = fundefs.map(f => codeGenFunction(f, emptyEnv)).map(f => f.join("\n"))
  const allfunc = funsCode.join("\n\n")

  const varDecls = vardefs.map(v => `(global $${v.name} (mut i32) (i32.const 0))`).join("\n")

  const varInitscode = vardefs.map(v => codeGenVarInits(v)).map(v => v.join("\n")).join("\n\n")

  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv)).flat()
  
  const main = [`(local $scratch i32)`, varInitscode, ...allStmts].join("\n")

  let lastStmt = null
  if(stmts.length > 0) {
    lastStmt = stmts[stmts.length - 1]
  }


  var retType = ""
  var retVal = ""
  if(lastStmt) {
  //if(true) {
    const isExpr = (lastStmt.tag === "expr");

    if(isExpr) {
      retType = "(result i32)"
      retVal = "(local.get $scratch)"
    }
  }
  // add again 
  // 
  const commands = `
    (module 
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))    
      ${varDecls}
      ${allfunc}
      (func (export "exported_func") ${retType}

        ${main}
        ${retVal}
      )
  )`;
  console.log("Generated: ", commands);
  return {
    wasmSource:commands
  }
}

function variableNames(stmts: varInits<Type>[]): Array<string> {
  const vars: Array<string> = [];
  stmts.forEach((stmt) => {
    vars.push(stmt.name)
  });
  return vars;
}

function codeGenFunction(func: funDefs<Type>, localEnv: Env) : Array<string> {
  const withParamsVariables = new Map<string, boolean>(localEnv);
  const variables = variableNames(func.inits);
  variables.forEach(v => withParamsVariables.set(v, true));
  func.params.forEach(p => withParamsVariables.set(p.name, true));

  const params = func.params.map(p => `(param $${p.name} i32)`).join(" ");
  const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

  const varInitscode = func.inits.map(v => codeGenVarInitsFunctions(v)).map(v => v.join("\n")).join("\n\n")


  const stmts = func.body.map(s => codeGenStmt(s, withParamsVariables)).flat()
  const stmts_body = stmts.join("\n")
  
  return [` ( func $${func.name} ${params} (result i32)
            (local $scratch i32)
            ${varDecls}
            ${varInitscode}
            ${stmts_body}
            (i32.const 0))`]
}

function codeGenVarInits(varinits: varInits<Type>) : Array<string> {
  var valStmts = codeGenLiteral(varinits.init);   
  valStmts.push(`(global.set $${varinits.name})`);
  return valStmts;
}

function codeGenVarInitsFunctions(varinits: varInits<Type>) : Array<string> {
  var valStmts = codeGenLiteral(varinits.init);   
  valStmts.push(`(local.set $${varinits.name})`);
  return valStmts;
}



function codeGenStmt(stmt: Stmt<Type>, localEnv: Env) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      var valStmts = codeGenExpr(stmt.value, localEnv);     
      if(localEnv.has(stmt.name)) {
        valStmts.push(`(local.set $${stmt.name})`);
      }
      else {
        valStmts.push(`(global.set $${stmt.name})`);
      }
      return valStmts;

    case "expr":
      const expr_Stmt = codeGenExpr(stmt.expr, localEnv);
      expr_Stmt.push(`(local.set $scratch)`);
      return expr_Stmt;

    case "return":
      const return_Stmt = codeGenExpr(stmt.ret, localEnv);
      return_Stmt.push(`(return)`)
      return return_Stmt
    
    case "pass":
      break;
    
      /**
       *  (if
      (then
        i32.const 1
        call $log ;; should log '1'
      )
      (else
        i32.const 1
            (if
      (then
        i32.const 1
        call $log ;; should log '1'
      )
         (else 
        i32.const 0
        call $log ;; should log '0'
      )
    )
      )
  )
       * 
       */
    case "if":
      var if_cond_code = codeGenExpr(stmt.cond, localEnv)
      let ifCode: string [] = if_cond_code
      ifCode.push(`(if`)
      ifCode.push(`(then`)

      const if_Stmts = stmt.if_block.map(st => codeGenStmt(st, localEnv)).flat()
      console.log("then block:")
      console.log(if_Stmts)
      ifCode = ifCode.concat(if_Stmts)
      ifCode.push(`)`)
      let elifStmts  = stmt.elif_block.map(st => codeGenStmt(st, localEnv)).flat()
      let elseStmts = stmt.else_block.map(st => codeGenStmt(st, localEnv)).flat()
      let restCode = elifStmts.concat(elseStmts)
      if(restCode.length == 0) {
        ifCode.push(`)`)
      }
      else {
        ifCode.push(`(else`) // start else block
        ifCode = ifCode.concat(restCode).concat([')',')'])
      }
      return ifCode;

    case "while":
      var condCode = codeGenExpr(stmt.cond, localEnv);
      let loopCode:string[] = ['(block','(loop']
      loopCode.push(`(br_if 1 `)
      loopCode = loopCode.concat(condCode);
      loopCode.push(`(i32.eqz))`)
    

      const while_block = stmt.while_block.map(st => codeGenStmt(st, localEnv)).flat()
      loopCode = loopCode.concat(while_block);
      loopCode = loopCode.concat([`(br 0)`, `)`, `)`]);    
      return loopCode;
  }
}

function codeGenExpr(expr : Expr<Type>, locals: Env) : Array<string> {
  switch(expr.tag) {
    case "literal":
      return codeGenLiteral(expr.literal)

    case "id":
      if(locals.has(expr.name)) { 
        return [`(local.get $${expr.name} )`];  
      }
      else {
        return [`(global.get $${expr.name} )`];  
      }
    case "uniop":
      const uExpr =  codeGenExpr(expr.arg, locals)
      switch(expr.op) {
        case "not":
          return [...uExpr, ...[`(i32.const 1)`, `(i32.xor)`]]
        case "-":
          return [`(i32.const 0)`,...uExpr, `(i32.sub)`]
        default:
          throw new Error("Not supported operator")
      }

    case "binop":
      const leftExprs= codeGenExpr(expr.left, locals);
      const rightExprs = codeGenExpr(expr.right, locals);

      // only None is None is true - give errors for others
      if(expr.op == binOp.IS) {
        if(expr.left.a == Type.none)
          return [`(i32.const 1)`]
        else
          return [ `(i32.const 0)`]
      }

      const opStmts = codeGenBinop(expr.op)
      return [...leftExprs, ...rightExprs, opStmts];

    case "call":
      const args_stmt = expr.args.map(e => codeGenExpr(e, locals)).flat()
      let callFunction = expr.name
      if(callFunction == "print") {
        switch(expr.args[0].a) {
          case Type.int:
            callFunction = "print_num";
            break;

          case Type.bool:
            callFunction = "print_bool";
            break;

          case Type.none:
            callFunction = "print_none";
            break;
          default:
            callFunction = "print_num";
            break;
        }
      }
      args_stmt.push(`(call $${callFunction} )`)
      return args_stmt;
  }
}

function codeGenLiteral(literal: Literal<Type>) :Array <string>{
  switch(literal.tag) {
    case "num":
      return [`(i32.const ${literal.value})`]
    case "bool":
      if (literal.value)
        return [`(i32.const 1)`]
      else
        return [`(i32.const 0)`]
    case "none":
      return [`(i32.const 0)`]
  }
}

function codeGenBinop(op: string) : string {
  switch(op) {
    case binOp.PLUS:
      return  "(i32.add)"
    case binOp.MINUS:
      return  "(i32.sub)"
    case binOp.MUL:
      return  "(i32.mul)"
    case binOp.DIV:
      return  "(i32.div_s)"
    case binOp.MOD:
      return  "(i32.rem_s)"
    case binOp.EQUALS:
      return  "(i32.eq)"
    case binOp.NOTEQUALS:
      return  "(i32.ne)"
    case binOp.LEQ:
      return  "(i32.le_s)"
    case binOp.GEQ:
      return  "(i32.ge_s)"
    case binOp.LQ:
      return  "(i32.lt_s)"
    case binOp.GQ:
      return  "(i32.gt_s)"

  }

}
