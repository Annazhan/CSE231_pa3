import {Expr, Literal, Program, Type, varInits, funDefs, Stmt, typedVar, binOp, ClassDef, MethodDef} from './ast';

export type TypeEnv = {
    vars: Map <string, Type>
    funs: Map <string, [Type[], Type]>,
    classes: Map <string, [Map<string, Type>, Map <string, [Type[], Type]>]>
    retType: Type
}

var globalEnvs: TypeEnv = {
    vars: new Map <string, Type>(), 
    funs: new Map <string, [Type[], Type]>(), 
    classes: new Map <string, [Map<string, Type>, Map <string, [Type[], Type]>]>(),
    retType: "none" as Type
};

export function assignable(lhs: Expr<Type>, rhs: Expr<Type>){
    if(lhs.a === "bool" || lhs.a === "int"){
        if(lhs.a === rhs.a){
            return true;
        }
        return false;
    }else if(lhs.a === "none"){
        return false
    }else if(rhs.a === "none"){
        return true
    }else if(rhs.a !== "bool" && rhs.a!== "int"){
        if(lhs.a.name === rhs.a.name){
            return true;
        }
    }
    return false;
}


function duplicateEnv(env: TypeEnv): TypeEnv{
    return {
        vars: new Map(env.vars), 
        funs: new Map (env.funs), 
        classes: env.classes,
        retType: env.retType
    }
}

function createClassEnv(env: TypeEnv):TypeEnv {
    return {
        vars: new Map <string, Type>(),
        funs: new Map (env.funs), 
        classes: env.classes,
        retType: env.retType,
    }
}

export function typeCheckProgram(prog: Program<null>) : Program<Type> {

    var localEnvs: TypeEnv = {
        vars: new Map <string, Type>(), 
        funs: new Map <string, [Type[], Type]>(), 
        classes: new Map <string, [Map<string, Type>, Map <string, [Type[], Type]>]>(),
        retType: "none" as Type
    };
    
    var varinits_typecheck: varInits <Type>[] = [];
    var fundefs_typecheck: funDefs<Type>[] = [];
    var stmts_typecheck: Stmt <Type>[] = [];
    var class_typecheck: ClassDef<Type>[] = [];
    
    varinits_typecheck = typeCheckVarInits(prog.varinits,localEnvs)
    
    globalEnvs = duplicateEnv(localEnvs)

    var fundefs_typecheck_firstpass = prog.fundefs.map(v => typeCheckFunDefsInitialPass(v, localEnvs))
    fundefs_typecheck = fundefs_typecheck_firstpass.map(v => typeCheckFunDefs(v, globalEnvs))
    //fundefs_typecheck = prog.fundefs.map(v => typeCheckFunDefs(v, localEnvs))
   
    
    //add variable and function definitions
    localEnvs = globalEnvs
    var stmt_env = duplicateEnv(localEnvs)

    varinits_typecheck.forEach((init) => {
        stmt_env.vars.set(init.name, init.type)
    })

    fundefs_typecheck.forEach(init => {
        stmt_env.funs.set(init.name,[init.params.map(param => param.type), init.ret] )
    })

    stmts_typecheck = typeCheckStmts(prog.stmts, stmt_env)
    //console.log(stmts_typecheck)
    return {a:"none" as Type, varinits: varinits_typecheck, fundefs:fundefs_typecheck ,stmts: stmts_typecheck};
}

export function tcClassDef(userClass: ClassDef<null>, env: TypeEnv) : ClassDef<Type> {
    var classType = {tag: "class", name: userClass.name} as Type;

    var classField = new Map <string, Type>();
    userClass.varinits.forEach(param => classField.set(param.name, param.type));
    var methods = new Map<string, [Type[], Type]>();
    userClass.methodDefs.forEach(m => methods.set(m.name, [m.params.map(p => p.type), m.ret]));

    if(env.classes.has(userClass.name)){
        throw new Error("TypeCheckerError: The class has already exsits");
    }
    if(env.vars.has(userClass.name)){
        throw new Error(`TypeCheckerError: The name ${userClass.name} has already used`);
    }

    //add class definition in advance
    env.classes.set(userClass.name, [classField, methods]);

    var classEnv = createClassEnv(env);

    var new_inits = typeCheckVarInits(userClass.varinits, classEnv);
    var new_method = 
    
    return any;
}

export function tcMethod(className: string, method: MethodDef<null>, env: TypeEnv) : MethodDef<Type> {
    var funDef = {
        name: `$${className}_$${method.name}`, 
        params: method.params, 
        ret: method.ret,
        inits: method.inits,
        body: method.body,
    } as funDefs<null>;

    //the method in this function will be found in
    var newFundef = typeCheckFunDefs(funDef, env);
}

export function typeCheckVarInits(inits: varInits <null>[], env:TypeEnv) : varInits<Type> [] {
    const typedInits:  varInits<Type> [] = [];
    inits.forEach((init) => {
        const typedInit = typeCheckLiteral(init.init)
        if(typedInit.a !== init.type)
            throw new Error("TYPE ERROR: init type does not match literal type")
        env.vars.set(init.name, init.type)
        typedInits.push({...init, a:init.type, init: typedInit})
    })
    return typedInits;
}

export function typeCheckFunDefsInitialPass(fun: funDefs <null>, env:TypeEnv) : funDefs<null>  {
   
    //add function to env
    globalEnvs.funs.set(fun.name, [fun.params.map(param => param.type), fun.ret])
    
    //add return type
    globalEnvs.retType = fun.ret;
    return fun;
    //return {...fun, params:typedParams, inits:typedInits, body: fun.body  }
}

export function typeCheckFunDefs(fun: funDefs <null>, env:TypeEnv) : funDefs<Type>  {
    const localEnv = duplicateEnv(env)
    // add params to env
    fun.params.forEach(param => {
        localEnv.vars.set(param.name, param.type)
    }) 

    const typedParams = typeCheckParams(fun.params)

    // add inits to env
    const typedInits = typeCheckVarInits(fun.inits, env)

    fun.inits.forEach(init => {
        localEnv.vars.set(init.name, init.type)
    })

    //add function to env
    localEnv.funs.set(fun.name, [fun.params.map(param => param.type), fun.ret])
    
    //add return type
    localEnv.retType = fun.ret

    // check function body
    // make sure every path has expected return
    const typedStmts = typeCheckStmts(fun.body, localEnv)
    return {...fun, params:typedParams, inits:typedInits, body: typedStmts  }
}

export function typeCheckParams(params: typedVar <null>[]) : typedVar <Type>[]{
    return params.map(param => {
        return {...param, a:param.type}
    })
}

export function typeCheckStmts(stmts: Stmt<null>[], env:TypeEnv ): Stmt <Type>[] {
    const typedStmts : Stmt<Type>[] = [];
    stmts.forEach(stmt => {
        switch(stmt.tag) {
            case "assign":
                if(!env.vars.has(stmt.name)) {
                    throw new Error("TYPE ERROR: unbound id")
                }
                const typedValue = typeCheckExpr(stmt.value, env)
                if(typedValue.a !== env.vars.get(stmt.name)) {
                    throw new Error("TYPE ERROR: cannot assign value to id")
                }
                typedStmts.push({...stmt, value:typedValue, a:Type.none})
                break
            case "return":
                const typedRet = typeCheckExpr(stmt.ret, env)
                if(env.retType !== typedRet.a) {
                    throw new Error("TYPE ERROR: return type mismatch")
                }
                typedStmts.push({...stmt, ret: typedRet, a:Type.none})
                break;

            case "if":
                const ifcond_typeCheck = typeCheckExpr(stmt.cond, env)

                if(ifcond_typeCheck.a != Type.bool)  {
                    throw new Error("Condition Expression has to be bool")
                }

                const if_block_typeCheck = typeCheckStmts(stmt.if_block, env);

                const elif_block_typeCheck = typeCheckStmts(stmt.elif_block, env);

                const else_block_typeCheck = typeCheckStmts(stmt.else_block, env);
                typedStmts.push({...stmt, cond:ifcond_typeCheck, if_block:if_block_typeCheck, 
                    elif_block: elif_block_typeCheck, else_block:else_block_typeCheck,   a:Type.none})

                //const typeCheckCondition ...Expr
                //const typeCheckThen ... Stmt[]
                //const typeCheckElse ...Stmt[]
               break;

            case "while":
                const cond_typecheck = typeCheckExpr(stmt.cond, env)

                if(cond_typecheck.a != Type.bool)  {
                    throw new Error("Condition Expression has to be bool")
                }
                const while_block_typecheck = typeCheckStmts(stmt.while_block, env)
                typedStmts.push({...stmt, cond:cond_typecheck,while_block:while_block_typecheck ,a:Type.none});
                break;
            
            case "pass":
                typedStmts.push({...stmt, a: Type.none})
                break
            case "expr":
                const typedExpr = typeCheckExpr(stmt.expr, env)
                typedStmts.push({...stmt,  expr:typedExpr, a: Type.none})
                break
      }  
    })
    return typedStmts
}
export function typeCheckExpr(expr: Expr<null>, env: TypeEnv) : Expr<Type> {
    switch(expr.tag) {
        case "id":
            if(!env.vars.has(expr.name))
                throw new Error("TYPE ERROR: not recognized variable id")
            const idType = env.vars.get(expr.name)
            return {...expr, a:idType}
        case "literal":
            const literal_expr = typeCheckLiteral(expr.literal)
            return {...expr, a:literal_expr.a, literal: literal_expr}

        case "uniop":
            const uexpr = typeCheckExpr(expr.arg, env)
            switch(expr.op) {
                case "not":
                    if(uexpr.a != Type.bool) 
                        throw new Error("not operator only works with bool type")
                    return {...expr, arg:uexpr, a:Type.bool}
                case "-":
                    if(uexpr.a != Type.int) 
                    throw new Error("- operator only works with int type")
                return {...expr, arg:uexpr, a:Type.int}
            } 
            return {...expr, arg:uexpr, a:Type.int}
        case "binop":
            const left = typeCheckExpr(expr.left, env);
            const right = typeCheckExpr(expr.right, env);
            switch(expr.op) {
                case binOp.PLUS:    
                case binOp.MINUS:
                case binOp.MUL:
                case binOp.DIV:
                case binOp.MOD: 
                    if (left.a !== Type.int)
                        throw new Error("TYPE ERROR: left expression is not int with operator " + expr.op);
            
                    if (right.a !== Type.int)
                    throw new Error("TYPE ERROR: Right expression is not int with operator " + expr.op);
                    return {...expr, left, right, a: Type.int};

                case binOp.EQUALS:
                case binOp.NOTEQUALS:
                case binOp.LEQ:
                case binOp.GEQ:
                case binOp.LQ:
                case binOp.GQ:
                    if (left.a !== Type.int)
                    throw new Error("TYPE ERROR: left expression is not int with operator " + expr.op);
            
                    if (right.a !== Type.int)
                    throw new Error("TYPE ERROR: Right expression is not int with operator " + expr.op);
                    return {...expr, left, right, a: Type.bool};               
                case binOp.IS:
                    if (left.a !== Type.none || right.a !== Type.none)
                        throw new Error("TYPE ERROR: is operator doesn't work with int and bool")
                    
                    return {...expr, left, right, a: Type.bool};     
            }
            return {...expr, left, right, a: Type.int};
        case "call":
            const callName = expr.name;
            const args_typecheck = expr.args.map(e => typeCheckExpr(e, env));
            
            if(callName == "print") {
                if(args_typecheck.length != 1)
                    throw new Error("Incorrect arguments for print");
                return {...expr, args:args_typecheck, a:Type.none}
            }   

            if(!env.funs.has(callName))
                throw new Error("Unrecognized function name")
            const fundetails = env.funs.get(callName)
            if(fundetails[0].length != args_typecheck.length)
                throw new Error("Incorrect arguments for function: " + callName)
            for(let i = 0; i < fundetails[0].length; i++) {

                if(fundetails[0][i] !== args_typecheck[i].a)
                    throw new Error("Type mismatch in function argument: " + i)
            }
            return {...expr, args: args_typecheck,a: fundetails[1]};

        case "literal":
            const lit = typeCheckLiteral(expr.literal);
            return {...expr, a: lit.a};   
    }

}

export function typeCheckLiteral(literal: Literal<null>) : Literal<Type> {
    switch(literal.tag) {
        case "num":
            return {...literal, a: Type.int}
        case "none":
            return {...literal, a: Type.none}
        case "bool":
            return {...literal, a: Type.bool}
    }

}