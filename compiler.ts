import { stringify } from "querystring";
import { Stmt, Expr, binOp, Type, funDefs, Literal, varInits, LValue, Program, ClassDef, MethodDef } from "./ast";
import { parse, traverseExpr } from "./parser";
import {typeCheckProgram } from "./typecheck"

// https://learnxinyminutes.com/docs/wasm/

type Env = {
  classes: Map<string, [Map<string, number>,number]>,
  variable: Map<string, number>
};

type CompileResult = {
  variableDeclare: string,
  functions: string,
  codeBody: string,
};

export function compile(source: Program<Type>) : CompileResult {
  const vardefs = source.varinits
  const fundefs = source.fundefs
  const stmts = source.stmts
  const classDefs = source.classes

  const emptyEnv = {
    classes: new Map<string, [Map<string, number>, number]>(),
    variable: new Map<string, number>()
  };

  const funsCode: string [] = fundefs.map(f => codeGenFunction(f, emptyEnv)).map(f => f.join("\n"))
  const classMethod = classDefs.map(classDef => 
    classDef.methodDefs.map(m => codeGenClassMethod(classDef.name, m, emptyEnv)).join("\n")
  ).join("\n")
  funsCode.push(classMethod)
  const allfunc = funsCode.join("\n\n")

  const varDecls = vardefs.map(v => `(global $${v.name} (mut i32) (i32.const 0))`);
  varDecls.push("(global $$heap (mut i32) (i32.const 4))")

  const varInitscode = vardefs.map(v => codeGenVarInits(v)).map(v => v.join("\n")).join("\n\n")

  const classField  = new Map<string, string[]>();
  classDefs.forEach(c => classField.set(c.name, c.varinits.map(v => v.name)));
  
  vardefs.forEach(v => {
    if(v.a!== "bool" && v.a !== "none" && v.a!== "int"){
      var fields = new Map<string, number>();
      classField.get(v.name).forEach((f, index) => fields.set(f, index));
      emptyEnv.classes.set(v.name, [fields, 0]);
    }
  })

  
  const allStmts = stmts.map(s => codeGenStmt(s, emptyEnv)).flat()
  
  const codeBody = [`(local $$last i32)`, varInitscode, ...allStmts].join("\n")

  return {
    variableDeclare: varDecls.join("\n"),
    functions: allfunc,
    codeBody: codeBody,
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
  const withParamsVariables: Env = {
    variable: new Map<string, number>(localEnv.variable),
    classes: localEnv.classes,
  };
  const variables = variableNames(func.inits);
  variables.forEach(v => withParamsVariables.variable.set(v, 0));
  func.params.forEach(p => withParamsVariables.variable.set(p.name, 0));
  

  const params = func.params.map(p => `(param $${p.name} i32)`).join(" ");
  const varDecls = variables.map(v => `(local $${v} i32)`).join("\n");

  const varInitscode = func.inits.map(v => codeGenVarInitsFunctions(v)).map(v => v.join("\n")).join("\n\n")


  const stmts = func.body.map(s => codeGenStmt(s, withParamsVariables)).flat()
  const stmts_body = stmts.join("\n")
  
  return [` ( func $${func.name} ${params} (result i32)
            (local $$last i32)
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

function codeGenClassMethod(className: string, method: MethodDef<Type>, localEnv: Env): Array<string>{
  const funDef = {
    ...method, 
    name: `${className}_$${method.name}`,
  }
  return codeGenFunction(funDef, localEnv);
}


function codeGenStmt(stmt: Stmt<Type>, localEnv: Env) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      var valStmts = codeGenExpr(stmt.value, localEnv);     
      var param = codeGenLValue(stmt.lhs, localEnv);
      if(stmt.lhs.tag === "field"){
        return [...param, ...valStmts, "(i32.store)"]
      }
      return [...valStmts, ...param];

    case "expr":
      const expr_Stmt = codeGenExpr(stmt.expr, localEnv);
      expr_Stmt.push(`(local.set $$last)`);
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
      if(locals.variable.has(expr.name)) { 
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
          throw new Error("COMPILER ERROR: Not supported operator")
      }

    case "binop":
      const leftExprs= codeGenExpr(expr.left, locals);
      const rightExprs = codeGenExpr(expr.right, locals);

      // only None is None is true - give errors for others
      if(expr.op == binOp.IS) {
        if(expr.left.a === "none")
          return [`(i32.const 1)`]
        else
          return [ `(i32.const 0)`]
      }

      const opStmts = codeGenBinop(expr.op)
      return [...leftExprs, ...rightExprs, opStmts];

    case "call":
      if(locals.classes.has(expr.name)){
        let classIntit:string[] = [];
        const size = locals.classes.get(expr.name)[0].length-1;
        locals.classes.get(expr.name)[0].slice(0, size).forEach((v, index) => {
          const offset = 4 * index;

          classIntit = [
            ...classIntit,
            `(global.get $$heap)`,
            `(i32.add(i32.const ${offset}))`,
            ...codeGenLiteral(v.init),
            `(i32.store)`
          ];
        });
        return [
          ...classIntit,
          // `(global.get $$heap)`,
          `(global.set $$heap (i32.add (global.get $$heap) (i32.const ${size * 4})))`,
          `(global.get $$heap)`,
          `(i32.sub (i32.const ${size * 4}))`,
        ];
      }
      const args_stmt = expr.args.map(e => codeGenExpr(e, locals)).flat()
      let callFunction = expr.name
      if(callFunction == "print") {
        switch(expr.args[0].a) {
          case "int":
            callFunction = "print_num";
            break;

          case "bool":
            callFunction = "print_bool";
            break;

          case "none":
            callFunction = "print_none";
            break;
          default:
            new Error(`COMPILER ERROR: the print doesn't support ${expr.args[0].a.tag} type`)
        }
      }
      args_stmt.push(`(call $${callFunction} )`)
      return args_stmt;
    case "method":
      const typeMethod = expr.obj.a;
      if(typeMethod!== "bool" && typeMethod !== "int" && typeMethod !== "none"){
        const className = typeMethod.name;
        const objMethod = codeGenExpr(expr.obj, locals);
        const args_method = [...objMethod];
        args_method.push(expr.args.map(e => codeGenExpr(e, locals)).join("\n"));
        let method_name = `${className}_$${expr.name}`;
        args_method.push(`(call $${method_name})`);
        return args_method;
      }
    case "getField":
      const obj = codeGenExpr(expr.obj, locals);
      const type = expr.obj.a;
      if(type!== "bool" && type !== "int" && type !== "none"){
        const className = type.name;
        const fields = locals.classes.get(className)[0].map(i => i.name);
        const index = fields.indexOf(expr.name);
        return [
          ...obj,
          `(i32.add (i32.const ${index * 4}))`,
          `(i32.load)`
        ]
      }
  }
}

export function codeGenLValue(lValue: LValue<Type>, localEnv: Env): Array<string>{
  switch(lValue.tag){
    case "variable":
      if(localEnv.variable.has(lValue.name)){
        return [`(local.set $${lValue.name})`]
      }
      else{
        return [`(global.set $${lValue.name})`]
      }
    case "field":
      const ObjExpr = codeGenExpr(lValue.obj, localEnv);
      const type = lValue.obj.a;
      if(type === "bool" || type === "int" || type === "none"){
        throw new Error("COMPILER ERROR: The type should be a class");
      }else{
        const className = type.name;
        const fields = localEnv.classes.get(className)[0].map(lit => lit.name);
        const index = fields.indexOf(lValue.name);
        return [
          ...ObjExpr,
          `(i32.add (i32.const ${index * 4}))`
        ]
      }

    default:
      new Error("COMPILER ERROR: not a valid left value");
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
