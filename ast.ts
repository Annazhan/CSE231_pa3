

export type Program<A> = {a?:A, varinits: varInits<A>[], fundefs:funDefs<A>[],stmts: Stmt<A>[]}

export type varInits<A> = {a?:A, name:string, type: Type, init: Literal<A> }

export type funDefs<A> = {a?:A, name:string, params:typedVar<A>[], ret:Type, inits:varInits<A>[], body:Stmt<A>[]}

export type typedVar<A> = {a?:A, name:string, type:Type}

export type Stmt<A> =
  {a?:A, tag: "assign", name: string, value: Expr<A> }
| {a?:A, tag: "return", ret : Expr<A> }
| {a?:A, tag: "pass"}
| {a?:A, tag: "expr", expr: Expr <A> }
| {a?:A, tag: "if", cond: Expr<A>, if_block: Stmt<A>[]  ,elif_block: Stmt<A>[], else_block: Stmt<A>[] }
| { a?:A, tag: "while", cond: Expr<A>,  while_block: Stmt<A>[]}

export type Expr<A> =
 //{a?:A, tag: "num", value: number }
  {a?:A, tag: "id", name: string }
| {a?:A, tag:"literal", literal:Literal<A>}
| {a?:A, tag: "uniop", op: string, arg: Expr<A>  }
| {a?:A,tag: "binop", left:Expr<A> , op: string, right:Expr<A>  }
| {a?:A, tag:"call", name:string, args: Expr <A>[]}

export type Literal <A> = 
  {a?:A, tag: "num", value: number} 
| {a?:A, tag: "bool", value: boolean}
| {a?:A, tag: "none"}

export enum binOp {PLUS = "+", MINUS = "-", 
          MUL = "*", DIV = "//", MOD = "%", EQUALS = "==",
           NOTEQUALS = "!=", LEQ = "<=", GEQ = ">=", LQ = "<", GQ = ">", IS = "is"}
           

export enum Type{int, bool, none}


