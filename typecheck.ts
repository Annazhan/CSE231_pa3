import {Expr, Literal, Program, Type, varInits, funDefs, Stmt, typedVar, binOp, ClassDef, MethodDef, LValue} from './ast';

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

export function assignable(lhs: Type, rhs: Type){
    if(lhs === "bool" || lhs === "int"){
        if(lhs === rhs){
            return true;
        }
        throw new Error(`TYPE ERROR: can't assign ${lhs} to ${rhs}`);
    }else if(lhs === "none" && rhs === "none"){
        return true;
    }if(lhs === "none"){
        throw new Error(`TYPE ERROR: can't assign to ${lhs} type`);
    }else if(rhs === "none"){
        return true;
    }else if(rhs !== "bool" && rhs !== "int"){
        if(lhs.name === rhs.name){
            return true;
        }
    }
    throw new Error(`TYPE ERROR: can't assign ${lhs} to ${rhs}`);
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
    
    globalEnvs = duplicateEnv(localEnvs);

    var varinits_typecheck: varInits <Type>[] = [];
    var fundefs_typecheck: funDefs<Type>[] = [];
    var stmts_typecheck: Stmt <Type>[] = [];
    var class_typecheck: ClassDef<Type>[] = [];
    
    varinits_typecheck = typeCheckVarInits(prog.varinits,globalEnvs)

    var fundefs_typecheck_firstpass = prog.fundefs.map(v => typeCheckFunDefsInitialPass(v, globalEnvs));
    fundefs_typecheck = fundefs_typecheck_firstpass.map(v => typeCheckFunDefs(v, globalEnvs));
    //fundefs_typecheck = prog.fundefs.map(v => typeCheckFunDefs(v, localEnvs))
    class_typecheck = prog.classes.map(c=>tcClassDef(c, globalEnvs));
    
    //add variable and function definitions
    var stmt_env = duplicateEnv(globalEnvs)

    varinits_typecheck.forEach((init) => {
        stmt_env.vars.set(init.name, init.type)
    })

    fundefs_typecheck.forEach(init => {
        stmt_env.funs.set(init.name,[init.params.map(param => param.type), init.ret] )
    })

    stmts_typecheck = typeCheckStmts(prog.stmts, stmt_env)
    //console.log(stmts_typecheck)
    return {a:"none" as Type, varinits: varinits_typecheck, fundefs:fundefs_typecheck, classes: class_typecheck, stmts: stmts_typecheck};
}

export function tcClassDef(userClass: ClassDef<null>, env: TypeEnv) : ClassDef<Type> {
    var classType = {tag: "class", name: userClass.name} as Type;

    var classField = new Map <string, Type>();
    userClass.varinits.forEach(param => classField.set(param.name, param.type));
    var methods = new Map<string, [Type[], Type]>();
    userClass.methodDefs.forEach(m => methods.set(m.name, [m.params.map(p => p.type), m.ret]));

    if(env.classes.has(userClass.name)){
        throw new Error("TYPE ERROR: The class has already exsits");
    }
    if(env.vars.has(userClass.name)){
        throw new Error(`TYPE ERROR: The name ${userClass.name} has already used`);
    }

    //add class definition in advance
    env.classes.set(userClass.name, [classField, methods]);

    var classEnv = createClassEnv(env);

    var new_inits = typeCheckVarInits(userClass.varinits, classEnv);
    new_inits.push({
        name: "self",
        a: {
            tag: "class",
            name: userClass.name,
        },
        type: {
            tag: "class",
            name: userClass.name,
        },
        init: {
            a: {
                tag: "class",
                name: userClass.name,
            },
            tag: "none"
        },
    })
    var new_method = userClass.methodDefs.map(m => tcMethod(m, classEnv));
    
    return {
        name: userClass.name, 
        varinits: new_inits, 
        methodDefs: new_method, 
        parent: {tag:"class", name: "object"}
    };
}

export function tcMethod(method: MethodDef<null>, env: TypeEnv) : MethodDef<Type> {
    var funDef = {
        name: method.name, 
        params: method.params, 
        ret: method.ret,
        inits: method.inits,
        body: method.body,
    } as funDefs<null>;

    //the method in the method will be found in function
    var newFundef = typeCheckFunDefs(funDef, env);

    return {
        a: newFundef.a,
        name: method.name,
        params: newFundef.params,
        ret: newFundef.ret,
        inits: newFundef.inits,
        body: newFundef.body,
    }
}

export function typeCheckVarInits(inits: varInits <null>[], env:TypeEnv) : varInits<Type> [] {
    const typedInits:  varInits<Type> [] = [];
    inits.forEach((init) => {
        const typedInit = typeCheckLiteral(init.init)
        if(!assignable(init.type, typedInit.a))
            throw new Error("TYPE ERROR: init type does not match literal type")
        env.vars.set(init.name, init.type)
        typedInits.push({...init, a:init.type, init: typedInit})
    });
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

export function tcLVaue(lValue: LValue<null>, env: TypeEnv) : LValue <Type> {
    switch(lValue.tag){
        case "field":
            const obj = typeCheckExpr(lValue.obj, env);
            if(obj.a === "bool" || obj.a === "int" || obj.a === "none"){
                throw new Error(`TYPE ERROR: ${obj} is not an object`);
            }else{
                const className = obj.a.name;
                if(env.classes.get(className)[0].has(lValue.name)){
                    const fieldType = env.classes.get(className)[0].get(lValue.name);
                    return {...lValue, obj: obj, a: fieldType};
                }
            }
            break;
        case "variable":
            if(env.vars.has(lValue.name)){
                const varType = env.vars.get(lValue.name);
                return {...lValue, a: varType};
            }
            break;
    }
}

export function typeCheckStmts(stmts: Stmt<null>[], env:TypeEnv ): Stmt <Type>[] {
    const typedStmts : Stmt<Type>[] = [];
    stmts.forEach(stmt => {
        switch(stmt.tag) {
            case "assign":
                const lhs = tcLVaue(stmt.lhs, env);
                const typedValue = typeCheckExpr(stmt.value, env)
                if(assignable(lhs.a, typedValue.a)) {
                    typedStmts.push({...stmt, lhs, value:typedValue, a: "none" as Type})
                }
                break
            case "return":
                const typedRet = typeCheckExpr(stmt.ret, env)
                if(!assignable(env.retType, typedRet.a)) {
                    throw new Error("TYPE ERROR: The return type doesm't match");
                }
                typedStmts.push({...stmt, ret: typedRet, a:typedRet.a});
                break;

            case "if":
                const ifcond_typeCheck = typeCheckExpr(stmt.cond, env)

                if(ifcond_typeCheck.a !== "bool")  {
                    throw new Error("TYPE ERROR: Condition Expression has to be bool")
                }

                const if_block_typeCheck = typeCheckStmts(stmt.if_block, env);

                const elif_block_typeCheck = typeCheckStmts(stmt.elif_block, env);

                const else_block_typeCheck = typeCheckStmts(stmt.else_block, env);
                typedStmts.push({...stmt, cond:ifcond_typeCheck, if_block:if_block_typeCheck, 
                    elif_block: elif_block_typeCheck, else_block:else_block_typeCheck,   a:"none"})

                //const typeCheckCondition ...Expr
                //const typeCheckThen ... Stmt[]
                //const typeCheckElse ...Stmt[]
               break;

            case "while":
                const cond_typecheck = typeCheckExpr(stmt.cond, env)

                if(cond_typecheck.a != "bool")  {
                    throw new Error("TYPE ERROR: Condition Expression has to be bool")
                }
                const while_block_typecheck = typeCheckStmts(stmt.while_block, env)
                typedStmts.push({...stmt, cond:cond_typecheck,while_block:while_block_typecheck ,a:"none"});
                break;
            
            case "pass":
                typedStmts.push({...stmt, a: "none" as Type})
                break
            case "expr":
                const typedExpr = typeCheckExpr(stmt.expr, env)
                typedStmts.push({...stmt,  expr:typedExpr, a: typedExpr.a})
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
                    if(uexpr.a !== "bool") 
                        throw new Error("TYPE ERROR: not operator only works with bool type")
                    return {...expr, arg:uexpr, a:"bool" as Type}
                case "-":
                    if(uexpr.a !== "int") 
                    throw new Error("TYPE ERROR: - operator only works with int type")
                return {...expr, arg:uexpr, a: "int" as Type}
            } 
            return {...expr, arg:uexpr, a:"int" as Type}
        case "binop":
            const left = typeCheckExpr(expr.left, env);
            const right = typeCheckExpr(expr.right, env);
            switch(expr.op) {
                case binOp.PLUS:    
                case binOp.MINUS:
                case binOp.MUL:
                case binOp.DIV:
                case binOp.MOD: 
                    if (left.a !== "int")
                        throw new Error("TYPE ERROR: left expression is not int with operator " + expr.op);
            
                    if (right.a !== "int"){
                        throw new Error("TYPE ERROR: Right expression is not int with operator " + expr.op);
                    }
                    return {...expr, left, right, a: "int" as Type};

                case binOp.EQUALS:
                case binOp.NOTEQUALS:
                case binOp.LEQ:
                case binOp.GEQ:
                case binOp.LQ:
                case binOp.GQ:
                    if (left.a !== "int")
                    throw new Error("TYPE ERROR: left expression is not int with operator " + expr.op);
            
                    if (right.a !== "int")
                    throw new Error("TYPE ERROR: Right expression is not int with operator " + expr.op);
                    return {...expr, left, right, a: "bool"};               
                case binOp.IS:
                    if (left.a === "none" && right.a === "none"){
                        return {
                            a: "bool", 
                            tag: "literal", 
                            literal: {a: "bool", tag: "bool", value: true}
                        };
                    }else if(left.a === 'bool' || left.a ==='int' || right.a === "bool" || right.a === "int"){
                        throw new Error("TYPE ERROR: is operator doesn't work with int and bool")
                    }else if(left.a!== "none" && right.a !== "none"){
                        if(left.a.name === right.a.name){
                            return {
                                a: "bool", 
                                tag: "literal", 
                                literal: {a: "bool", tag: "bool", value: true}
                            };
                        }
                    }
                    return {
                        a: "bool", 
                        tag: "literal", 
                        literal: {a: "bool", tag: "bool", value: false}
                    };
            }
            break;
        case "call":
            const callName = expr.name;
            const args_typecheck = expr.args.map(e => typeCheckExpr(e, env));
            
            if(callName == "print") {
                if(args_typecheck.length != 1)
                    throw new Error("TYPE ERROR: Incorrect arguments for print");
                return {...expr, args:args_typecheck, a:"none"}
            }   

            if(env.funs.has(callName)){
                const fundetails = env.funs.get(callName)
                if(fundetails[0].length != args_typecheck.length)
                    throw new Error("TYPE ERROR: Incorrect arguments for function: " + callName)
                for(let i = 0; i < fundetails[0].length; i++) {
    
                    if(assignable(fundetails[0][i], args_typecheck[i].a))
                        throw new Error("TYPE ERROR:Type mismatch in function argument: " + i)
                }
                return {...expr, args: args_typecheck,a: fundetails[1]};
            }
            if(env.classes.has(callName)){
                if(args_typecheck.length !== 0){
                    throw new Error("TYPE ERROR: class initialize doesn't have parameter");
                }
                return {...expr, a: {tag: "class", name: callName}};
            }
            throw new Error(`TYPE ERROR: ${callName} is neither function nor class initializer`);

        case "literal":
            const lit = typeCheckLiteral(expr.literal);
            return {...expr, a: lit.a};   
        case "method":
            const obj = typeCheckExpr(expr.obj, env);
            if(obj.a === "bool" || obj.a === "int" || obj.a === "none"){
                throw new Error(`TYPE ERROR: ${obj} is not an object`);
            }else{
                const className = obj.a.name;
                const argList = expr.args.map(a => typeCheckExpr(a, env));
                if(!env.classes.get(className)[1].has(expr.name)){
                    throw new Error(`TYPE ERROR: ${className} doesn't have function ${expr.name}`);
                }
                const methodDetails = env.classes.get(className)[1].get(expr.name);
                if(methodDetails[0].length !== (argList.length + 1)){
                    throw new Error("TYPE ERROR: The number of arguments doesn't match with the parameters in " + `${obj.a.name}.${expr.name}`);
                }
                for(let i = 0; i < argList.length; i++) {
                    if(!assignable(methodDetails[0][i+1], argList[i].a))
                        throw new Error(`TYPE ERROR: Type mismatch in function ${obj.a.name}.${expr.name} argument: ${i}`)
                }
                return {...expr, obj, args : argList, a: methodDetails[1]};
            }
        case "getField":
            const fieldObj = typeCheckExpr(expr.obj, env);
            if(fieldObj.a === "bool" || fieldObj.a === "int" || fieldObj.a === "none"){
                throw new Error(`TYPE ERROR: ${fieldObj} is not an object`);
            }else{
                const fieldClass = fieldObj.a.name;
                // if(!env.classes.get(fieldClass)[1].has(expr.name)){
                //     throw new Error(`TypeError: ${fieldClass} doesn't have function ${expr.name}`);
                // }
                if(!env.classes.get(fieldClass)[0].has(expr.name)){
                    throw new Error(`TYPE ERROR: ${fieldClass} doesn't have the field ${expr.name}`);
                }
                return {...expr, obj: fieldObj, a: env.classes.get(fieldClass)[0].get(expr.name)}
            }
    }

}

export function typeCheckLiteral(literal: Literal<null>) : Literal<Type> {
    switch(literal.tag) {
        case "num":
            return {...literal, a: "int" as Type}
        case "none":
            return {...literal, a: "none" as Type}
        case "bool":
            return {...literal, a: "bool" as Type}
        default:
            throw new Error("TYPE ERROR: not a literal");
    }

}